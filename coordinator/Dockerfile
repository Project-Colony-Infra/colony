# Build the Coordinator as a small static image.
FROM golang:1.25 AS build

WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -trimpath -o /out/coordinator ./cmd/server

FROM gcr.io/distroless/static-debian12
COPY --from=build /out/coordinator /coordinator
EXPOSE 8080 8081
VOLUME ["/data"]
ENTRYPOINT ["/coordinator"]
