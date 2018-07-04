// eslint-disable-next-line no-unused-vars
import { Game, Entity, Timer, Key, Debug, Gamepad, Physics, Sound, Net, Text, Util } from 'l1'
import { EVENTS, prettyId } from 'common'
import sprites from './sprites.json'
import { createLobby, addPlayerToLobby, players } from './lobby'
import { gameState } from './game'
import http from './http'
import signal from './signal'

const WS_ADDRESS = process.env.WS_ADDRESS || 'ws://localhost:3000'

const MAX_PLAYERS_ALLOWED = 10
export const LEFT = 'left'
export const RIGHT = 'right'

export const GAME_WIDTH = 1280
export const GAME_HEIGHT = 720

export const game = {
  started:                        false,
  gameCode:                       '',
  hasReceivedControllerCandidate: false,
  // TODO: change to array
  controllers:                    {
  },
  lastResult: {
    winner: null,
  },
}

const movePlayer = (pId, direction) => {
  const playerEntity = Entity.get(`${pId}controller`)
  if (playerEntity) {
    playerEntity.direction = direction
  } else {
    // TODO: stop sending useless movements events
    warn(`Failed to move player ${prettyId(pId)} with direction ${direction}`)
  }
}

const moveLeft = playerId => movePlayer(playerId, LEFT)
const moveRight = playerId => movePlayer(playerId, RIGHT)
const moveStraight = playerId => movePlayer(playerId, null)

const playerMovement = (id, { command, ordering }) => {
  if (game.controllers[id].lastOrder >= ordering) {
    log(`dropping old move: ${ordering}`)
    return
  }

  game.controllers[id].lastMoveOrder = ordering
  const commandFn = commands[command]
  if (commandFn) {
    commandFn(id)
  }
}

const gameStart = () => {
  if (!game.started) {
    Object
      .values(game.controllers)
      .forEach(({ id }) => {
        game.controllers[id].send({
          event:   EVENTS.RTC.GAME_STARTED,
          payload: {},
        })
      })

    gameState(MAX_PLAYERS_ALLOWED)
    game.started = true
  }
}

const { log, warn } = console

const rtcEvents = {
  [EVENTS.RTC.PLAYER_MOVEMENT]: playerMovement,
  [EVENTS.RTC.GAME_START]:      gameStart,
}

const commands = {
  [LEFT]:  moveLeft,
  [RIGHT]: moveRight,
  none:    moveStraight,
}

const createGame = ({ gameCode }) => {
  game.gameCode = gameCode
  createLobby(game.gameCode)
}

// TODO: extract event switch logic to common function
const onControllerData = id => (message) => {
  const { event, payload } = message

  const f = rtcEvents[event]
  if (!f) {
    warn(`Unhandled event for message: ${message.data}`)
    return
  }

  f(id, payload)
}

const moreControllersAllowed = () =>
  Object.keys(players).length < MAX_PLAYERS_ALLOWED && !game.started

const onControllerJoin = ({
  id,
  setOnData,
  send,
  close,
}) => {
  if (moreControllersAllowed()) {
    game.controllers[id] = {
      id,
      lastMoveOrder: -1,
      send,
    }
    const { color } = addPlayerToLobby({ playerId: id })

    send({
      event:   EVENTS.RTC.CONTROLLER_COLOR,
      payload: {
        playerId: id,
        color,
      },
    })
  } else {
    close()
  }

  // TODO: rambdify
  setOnData(onControllerData(id))
}

const onControllerLeave = (id) => {
  log(`[Controller Leave] ${id}`)
  // delete game.controllers[id]
  // TODO: remove from controllers and lobby
}

let ratio
export const getRatio = () => ratio

const resizeGame = () => {
  const screenWidth = window.innerWidth
  const screenHeight = window.innerHeight
  ratio = Math.min(screenWidth / GAME_WIDTH, screenHeight / GAME_HEIGHT)
  Game.getStage().scale.set(ratio)
  Game.getRenderer().resize(GAME_WIDTH * ratio, GAME_HEIGHT * ratio)
  Entity.getAll()
    .forEach((e) => {
      if (e.text) {
        e.text.style.fontSize = e.originalSize * ratio
        e.text.scale.set(1 / ratio)
      }
    })
}
window.addEventListener('resize', resizeGame)

Game.init(GAME_WIDTH, GAME_HEIGHT, sprites, { debug: false, element: document.getElementById('game') }).then(() => {
  http.createGame()
    .then(({ gameCode }) => {
      createGame({ gameCode })
      log(`[Game created] ${gameCode}`)

      signal({
        wsAdress:         WS_ADDRESS,
        receiverId:       gameCode,
        onInitiatorJoin:  onControllerJoin,
        onInitiatorLeave: onControllerLeave,
      })
    })

  const background = Entity.create('background')
  Entity.addSprite(background, 'background', { zIndex: -999999 })

  resizeGame()

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
