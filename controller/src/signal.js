import { EVENTS } from 'common'

const WEB_RTC_CONFIG = {
  iceServers: [
    {
      urls: 'stun:stun.l.google.com:19302',
    },
  ],
}
const WEB_RTC_CHANNEL_NAME = 'data.channel'

// TODO: working?
const isSafari = navigator.userAgent.indexOf('Safari') > -1
const rtcOptions = isSafari ? {} : { ordered: false, maxRetransmits: 0 }

const { log, warn } = console

// state
let ws
let rtc
let rtcChannel

let receiverId

const outputEvents = {
  onSuccess: null,
  onFailure: null,
}

// io
const emit = (event, payload) => {
  const message = JSON.stringify({ event, payload })
  ws.send(message)
}

const cleanUp = () => {
  ws.close()
  rtcChannel.close()
  rtc.close()
}

const onIceCandidate = ({ candidate }) => {
  if (!candidate) {
    log('[Ice Candidate] Last candidate retrieved')
    return
  }

  log(`[Ice Candidate] ${candidate}`)
  emit(EVENTS.WS.INITIATOR_CANDIDATE, { receiverId, candidate })
}

const onChannelOpen = () => {
  log(`[Data Channel] ${rtcChannel}`)
  outputEvents.onSuccess({
    setOnData: (onData) => {
      rtcChannel.onmessage = ({ data }) => {
        onData(JSON.parse(data))
      }
    },
    send: (data) => {
      rtcChannel.send(JSON.stringify(data))
    },
  })
}

const createOffer = () => rtc
  .createOffer()
  .then(offer => Promise.all([offer, rtc.setLocalDescription(offer)]))

const onAnswer = ({ answer }) => rtc
  .setRemoteDescription(answer)

const onReceiverCandidate = ({ candidate }) => {
  rtc.addIceCandidate(new RTCIceCandidate(candidate))
}

const onReceiverNotFound = () => {
  cleanUp()
  outputEvents.onFailure({ cause: 'NOT_FOUND' })
}

const wsEvents = {
  [EVENTS.WS.ANSWER]:             onAnswer,
  [EVENTS.WS.RECEIVER_CANDIDATE]: onReceiverCandidate,
  [EVENTS.WS.NOT_FOUND]:          onReceiverNotFound,
}

const onWsMessage = (message) => {
  const { event, payload } = JSON.parse(message.data)
  const f = wsEvents[event]
  if (!f) {
    warn(`Unhandled event for message: ${message.data}`)
    return
  }
  f(payload)
}

const init = options => new Promise((resolve, reject) => {
  ({ receiverId } = options)

  outputEvents.onSuccess = resolve
  outputEvents.onFailure = reject

  ws = new WebSocket(options.wsAdress)
  ws.onmessage = onWsMessage
  ws.onopen = () => {
    createOffer().then(([offer]) => {
      emit(EVENTS.WS.OFFER, { receiverId, offer })
    })
  }

  rtc = new RTCPeerConnection(WEB_RTC_CONFIG)
  rtcChannel = rtc.createDataChannel(WEB_RTC_CHANNEL_NAME, rtcOptions)
  rtcChannel.onopen = onChannelOpen

  rtc.onicecandidate = onIceCandidate
})

export default init
