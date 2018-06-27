const WebSocket = require('ws')
const uuid = require('uuid/v4')
const { clients } = require('./state')

const { EVENTS, prettyId } = require('common')

const TYPE = {
  INITIATOR: 'initiator',
  RECEIVER:  'receiver',
}

const { log, warn } = console

const getClient = id => clients.find(x => x.id === id)
const getReceiverClient = receiverId =>
  clients.find(x =>
    x.type === TYPE.RECEIVER &&
    x.receiverId === receiverId.toUpperCase())

const prettyClient = client => `${client.type}(${prettyId(client.id)})`

const createClient = socket => ({
  id:   uuid(),
  socket,
  type: TYPE.INITIATOR, // receiver clients get upgraded in onReceiverCreate
})

const emit = (client, event, payload) => {
  const message = JSON.stringify({ event, payload })
  client.socket.send(message)
}

const onReceiverUpgrade = client => (event, receiverId) => {
  client.type = TYPE.RECEIVER
  client.receiverId = receiverId
  log(`[Receiver upgrade] ${prettyClient(client)}`)
}

const onOffer = client => (event, { receiverId, offer }) => {
  const receiver = getReceiverClient(receiverId)
  if (!receiver) {
    warn(`Receiver with id ${receiverId} not found`)
    emit(client, EVENTS.WS.NOT_FOUND, { receiverId })
    return
  }
  log(`[Offer] ${prettyClient(client)} -> ${prettyClient(receiver)}`)
  emit(receiver, event, { offer, initiatorId: client.id })
}

const onAnswer = client => (event, { answer, initiatorId }) => {
  const initiator = getClient(initiatorId)
  if (!initiator) {
    warn(`Initiator with id ${initiatorId} not found`)
    return
  }
  log(`[Answer] ${prettyClient(client)} -> ${prettyClient(initiator)}`)
  emit(initiator, event, { answer })
}

const onInitiatorCandidate = client => (event, { candidate, receiverId }) => {
  const receiver = getReceiverClient(receiverId)
  if (!receiver) {
    warn(`Receiver with id ${receiverId} not found`)
    return
  }
  log(`[Initiator Candidate] ${prettyClient(client)} -> ${prettyClient(receiver)}`)
  emit(receiver, event, { candidate, initiatorId: client.id })
}

const onReceiverCandidate = client => (event, { candidate, initiatorId }) => {
  const initiator = getClient(initiatorId)
  if (!initiator) {
    warn(`Initiator with id ${initiatorId} not found`)
    return
  }
  log(`[Receiver Candidate] ${prettyClient(client)} -> ${prettyClient(initiator)}`)
  emit(initiator, event, { candidate })
}

const events = {
  [EVENTS.WS.RECEIVER_UPGRADE]:    onReceiverUpgrade,
  [EVENTS.WS.ANSWER]:              onAnswer,
  [EVENTS.WS.INITIATOR_CANDIDATE]: onInitiatorCandidate,
  [EVENTS.WS.RECEIVER_CANDIDATE]:  onReceiverCandidate,
  [EVENTS.WS.OFFER]:               onOffer,
}

const onMessage = client => (message) => {
  const { event, payload } = JSON.parse(message)
  const f = events[event]
  if (!f) {
    warn(`Unhandled event for message: ${message}`)
    return
  }
  f(client)(event, payload)
}

const onClose = (deleteReceiverId, client) => () => {
  const i = clients.indexOf(client)
  clients.splice(i, 1)

  if (client.type === TYPE.RECEIVER) {
    deleteReceiverId(client.receiverId)
  }
}

const init = (port, deleteReceiverId) => {
  const server = new WebSocket.Server({ port })
  log(`ws listening on port ${port}`)

  server.on('connection', (socket) => {
    const client = createClient(socket)
    clients.push(client)
    log(`[Client connected] ${prettyClient(client)}`)

    socket.on('message', onMessage(client))
    socket.on('close', onClose(deleteReceiverId, client))
  })
}

module.exports = {
  init,
}
