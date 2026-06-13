const http = require('http')
const { WebSocketServer } = require('ws')
const { setupWebSocket } = require('./game/handleMessages')

// 轻量 HTTP Server（仅用于健康检查 + WebSocket 升级）
const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ status: 'ok', service: 'vuechest-realtime' }))
    return
  }
  res.writeHead(200).end('VueChest Realtime Server')
})

// 挂载 WebSocket（路径 /snake，后续可加 /chat 等）
setupWebSocket(server)

const PORT = process.env.PORT || 3001
server.listen(PORT, () => {
  console.log(`[VueChest Realtime] Server running on port ${PORT}`)
  console.log(`[VueChest Realtime] WebSocket: ws://localhost:${PORT}/snake`)
})
