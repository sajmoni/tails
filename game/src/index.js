// eslint-disable-next-line no-unused-vars
import { Game, Entity, Timer, Key, Debug, Gamepad, Physics, Sound, Net, Text, Util } from 'l1'
import io from 'socket.io-client'
import uuid from 'uuid/v4'
import EVENTS from '../../common/events'
import sprites from './sprites.json'
import { createLobby, addPlayerToLobby, players } from './lobby'
import { gameState } from './game'

const ADDRESS = 'http://localhost:3000'
const game = {
  started:     false,
  gameCode:    '',
  controllers: {

  },
}

const configuration = {
  iceServers: [
    {
      urls: 'stun:stun.l.google.com:19302',
    },
  ],
}

export const LEFT = 'left'
export const RIGHT = 'right'

Game.init(1200, 600, sprites, { debug: true }).then(() => {
  const ws = io(ADDRESS)
  ws.emit(EVENTS.CREATE, '')

  ws.on(EVENTS.CREATED, ({ gameCode }) => {
    console.log('gameId', gameCode)
    game.gameCode = gameCode
    createLobby(game.gameCode)
  })

  ws.on(EVENTS.OFFER, ({ offer, controllerId }) => {
    console.log('received EVENTS.OFFER offer: ', offer)
    console.log('received EVENTS.OFFER controllerId: ', controllerId)
    const controller = new RTCPeerConnection(configuration)
    game.controllers[controllerId] = {
      rtc:        controller,
      candidates: [],
    }
    controller.onicecandidate = (event) => {
      console.log('onicecandidate', event)
      if (!event.candidate) {
        return
      }
      const { candidates } = game.controllers[controllerId]
      game.controllers[controllerId].candidates = candidates.concat(event.candidate)
    }

    controller
      .setRemoteDescription(new RTCSessionDescription(offer))
      .then(() => controller.createAnswer())
      .then((answer) => {
        controller.setLocalDescription(answer)
        ws.emit(EVENTS.ANSWER, { answer, controllerId })
      })

    controller.ondatachannel = (event) => {
      const playerId = uuid()
      // eslint-disable-next-line no-param-reassign
      event.channel.onopen = () => {
        // Add logic for when player has joined here
        console.log('channel: on open')
      }

      // eslint-disable-next-line no-param-reassign
      event.channel.onmessage = (e) => {
        const data = JSON.parse(e.data)

        const moveLeft = () => {
          Entity.get(`${playerId}controller`).direction = LEFT
        }

        const moveRight = () => {
          Entity.get(`${playerId}controller`).direction = RIGHT
        }

        const moveStraight = () => {
          Entity.get(`${playerId}controller`).direction = null
        }

        const playerMovement = () => {
          const {
            command,
          } = data.payload

          // Temporary solution to start game
          if (!game.started) {
            gameState()
            game.started = true
          } else {
            const commandFn = commands[command]
            if (commandFn) {
              commandFn()
            }
          }
        }

        const playerJoined = () => {
          if (Object.keys(players).length < 4 && !game.started) {
            addPlayerToLobby({ playerId })
            event.channel.send(JSON.stringify({ event: 'player.joined', payload: { playerId } }))
          } else {
            event.channel.close()
            controller.close()
          }
        }

        const gameStart = () => {
          // TODO Add event to start game
          // game()
        }

        const events = {
          [EVENTS.PLAYER_MOVEMENT]: playerMovement,
          [EVENTS.PLAYER_JOINED]:   playerJoined,
          [EVENTS.GAME_START]:      gameStart,
        }

        const commands = {
          [LEFT]:  moveLeft,
          [RIGHT]: moveRight,
          none:    moveStraight,
        }

        const eventFn = events[data.event]
        if (eventFn) {
          eventFn()
        }
      }
      console.log('on datachannel')
    }
  })

  ws.on(EVENTS.CONTROLLER_CANDIDATE, ({ controllerId, candidate }) => {
    console.log('received EVENTS.CONTROLLER_CANDIDATE offer: ', candidate)
    const controller = game.controllers[controllerId]
    if (!controller) {
      return
    }
    controller.rtc.addIceCandidate(new RTCIceCandidate(candidate))
    controller.candidates = controller.candidates.reduce((emptyList, c) => {
      ws.emit(EVENTS.GAME_CANDIDATE, { candidate: c, controllerId })
      return emptyList
    }, [])
  })

  Key.add('up')
  Key.add('down')
  Key.add('left')
  Key.add('right')
})

// Enable the following behaviour for keyboard debugging

// const player1Keyboard = () => ({
//   run: () => {
//     if (Key.isDown('left')) {
//       Entity.get('player1controller').direction = LEFT
//     } else if (Key.isDown('right')) {
//       Entity.get('player1controller').direction = RIGHT
//     } else {
//       Entity.get('player1controller').direction = null
//     }
//   },
// })
