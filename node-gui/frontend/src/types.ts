export interface Specs {
  os: string;
  arch: string;
  cpu_cores: number;
  ram_gb: number;
  disk_gb: number;
  gpu_model: string;
  gpu_memory_gb: number;
}

export interface Allocation {
  cpu_cores: number;
  ram_gb: number;
  gpu_memory_gb: number;
  bandwidth_mbps: number;
}

export interface Utilization {
  cpu_used: number;
  ram_used_gb: number;
  gpu_mem_used_gb: number;
  gpu_temp_c: number;
}

export interface ActivityEvent {
  time: string;
  level: string;
  message: string;
}

export interface State {
  node_name: string;
  node_id: string;
  connection: "CONNECTED" | "CONNECTING" | "DISCONNECTED";
  status: "ONLINE" | "OFFLINE";
  colony_id: string;
  coordinator_url: string;
  specs: Specs;
  allocation: Allocation;
  utilization: Utilization;
  events: ActivityEvent[];
}

export interface Config {
  node_id: string;
  node_name: string;
  coordinator_url: string;
  allocation: Allocation;
  only_when_idle: boolean;
  auto_start: boolean;
}
