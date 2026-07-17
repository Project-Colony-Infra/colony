package orchestrator

import (
	"encoding/json"
	"log"
	"net/http"
	"sync"

	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1 << 16,
	WriteBufferSize: 1 << 16,
	// Nodes connect from arbitrary hosts, so any origin is allowed for the beta.
	CheckOrigin: func(r *http.Request) bool { return true },
}

// safeConn serializes writes to a websocket connection.
type safeConn struct {
	conn *websocket.Conn
	wmu  sync.Mutex
}

func (c *safeConn) writeBinary(data []byte) error {
	c.wmu.Lock()
	defer c.wmu.Unlock()
	return c.conn.WriteMessage(websocket.BinaryMessage, data)
}

func (c *safeConn) writeText(data []byte) error {
	c.wmu.Lock()
	defer c.wmu.Unlock()
	return c.conn.WriteMessage(websocket.TextMessage, data)
}

// session pairs the two workers of a job and buffers tensors that arrive before
// their peer has connected.
type session struct {
	mu      sync.Mutex
	conns   map[string]*safeConn // role -> conn
	pending map[string][][]byte  // dest role -> buffered binary frames
}

func newSession() *session {
	return &session{
		conns:   make(map[string]*safeConn),
		pending: make(map[string][][]byte),
	}
}

// controlMessage is the JSON a worker sends on a text frame.
type controlMessage struct {
	Type   string `json:"type"`   // status, result, error
	Status string `json:"status"` // optional detail for status
	Text   string `json:"text"`   // final generated text for result
	Error  string `json:"error"`  // reason for error
}

func peerRole(role string) string {
	if role == "primary" {
		return "secondary"
	}
	return "primary"
}

func (m *Manager) getSession(jobID string) *session {
	m.mu.Lock()
	defer m.mu.Unlock()
	s, ok := m.sessions[jobID]
	if !ok {
		s = newSession()
		m.sessions[jobID] = s
	}
	return s
}

func (m *Manager) dropSession(jobID string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.sessions, jobID)
}

// ServeRelay upgrades a worker connection and relays its frames to its peer.
// Binary frames are activation tensors forwarded to the peer. Text frames are
// control messages the Coordinator reads to track job status and capture the
// final result.
func (m *Manager) ServeRelay(w http.ResponseWriter, r *http.Request) {
	jobID := r.URL.Query().Get("job")
	role := r.URL.Query().Get("role")
	if jobID == "" || (role != "primary" && role != "secondary") {
		http.Error(w, "job and role are required", http.StatusBadRequest)
		return
	}

	rawConn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("relay: upgrade for job %s role %s: %v", jobID, role, err)
		return
	}
	conn := &safeConn{conn: rawConn}
	log.Printf("relay: %s connected for job %s", role, jobID)

	sess := m.getSession(jobID)
	m.setStatus(jobID, StatusRunning)

	// Register and flush any tensors that arrived before this peer connected.
	sess.mu.Lock()
	sess.conns[role] = conn
	buffered := sess.pending[role]
	sess.pending[role] = nil
	sess.mu.Unlock()
	for _, frame := range buffered {
		if err := conn.writeBinary(frame); err != nil {
			log.Printf("relay: flush to %s for job %s: %v", role, jobID, err)
		}
	}

	defer func() {
		sess.mu.Lock()
		delete(sess.conns, role)
		empty := len(sess.conns) == 0
		sess.mu.Unlock()
		rawConn.Close()
		if empty {
			m.dropSession(jobID)
		}
	}()

	for {
		mt, data, err := rawConn.ReadMessage()
		if err != nil {
			return
		}
		switch mt {
		case websocket.BinaryMessage:
			m.forwardBinary(sess, role, data)
		case websocket.TextMessage:
			if done := m.handleControl(sess, jobID, role, data); done {
				return
			}
		}
	}
}

func (m *Manager) forwardBinary(sess *session, fromRole string, data []byte) {
	dest := peerRole(fromRole)
	sess.mu.Lock()
	peer := sess.conns[dest]
	if peer == nil {
		// Peer not connected yet, buffer until it arrives.
		frame := make([]byte, len(data))
		copy(frame, data)
		sess.pending[dest] = append(sess.pending[dest], frame)
		sess.mu.Unlock()
		return
	}
	sess.mu.Unlock()
	if err := peer.writeBinary(data); err != nil {
		log.Printf("relay: forward to %s: %v", dest, err)
	}
}

// handleControl reacts to a worker's text frame. It returns true when the job is
// finished and this connection should close.
func (m *Manager) handleControl(sess *session, jobID, fromRole string, data []byte) bool {
	var msg controlMessage
	if err := json.Unmarshal(data, &msg); err != nil {
		return false
	}
	switch msg.Type {
	case "result":
		m.setResult(jobID, msg.Text)
		log.Printf("relay: job %s finished", jobID)
		m.stopPeer(sess, fromRole)
		return true
	case "error":
		m.fail(jobID, msg.Error)
		log.Printf("relay: job %s failed: %s", jobID, msg.Error)
		m.stopPeer(sess, fromRole)
		return true
	case "status":
		m.setStatus(jobID, StatusRunning)
	}
	return false
}

func (m *Manager) stopPeer(sess *session, fromRole string) {
	dest := peerRole(fromRole)
	sess.mu.Lock()
	peer := sess.conns[dest]
	sess.mu.Unlock()
	if peer != nil {
		_ = peer.writeText([]byte(`{"type":"stop"}`))
	}
}
