import _ from 'lodash/fp'
import R from 'ramda'
import { Entity, Util, Timer, Sound, Sprite, Particles, Graphics } from 'l1'
import EventEmitter from 'eventemitter3'
import { EVENTS } from 'common'
import { LEFT, RIGHT, GAME_WIDTH, GAME_HEIGHT, gameState, playerCount } from '.'
import explode from './particleEmitter/explode'
import { transitionToRoundEnd } from './roundEnd'
import layers from './util/layers'
import countdown from './countdown'
import bounce from './bounce'

const { log } = console

const TURN_RADIUS = 3
const SPEED_MULTIPLIER = 3.6

const GENERATE_HOLE_MAX_TIME = 300
const GENERATE_HOLE_MIN_TIME = 60

const HOLE_LENGTH_MAX_TIME = 30
const HOLE_LENGTH_MIN_TIME = 10

const WALL_THICKNESS = 6
const WALL_COLOR = 0xffffff

export const GAME_EVENTS = { PLAYER_COLLISION: 'player.collision' }

const PLAYER_HITBOX_SIZE = 16
const TRAIL_HITBOX_SIZE = 24

const TOTAL_BOUNCE_DURATION = 50

export const GAME_COLORS = {
  BLUE: '0x004275',
}

export const transitionToGameScene = (maxPlayers) => {
  const doNotDestroy = [
    'background',
    'fadeInOut',
  ]

  Entity.getAll()
    .filter(e => !doNotDestroy.includes(e.id))
    .forEach(Entity.destroy)

  const playerCountFactor = R.compose(
    Math.sqrt,
    playerCount,
  )(gameState.players)

  const playerEntities = R.compose(
    R.zipWith(createPlayer(playerCountFactor), _.shuffle(R.range(0, maxPlayers))),
    _.shuffle,
    Object.values,
  )(gameState.players)

  createWalls()

  bouncePlayers(playerEntities, playerCountFactor)
    .then(countdown)
    .then(() => {
      playerEntities.forEach((player) => {
        player.behaviors.pivot = pivot(player.id)
        player.behaviors.holeGenerator = holeGenerator(playerCountFactor)
        player.behaviors.createTrail = createTrail(
          playerCountFactor,
          player.id,
          player.spriteId,
          player.behaviors.holeGenerator,
        )
        player.behaviors.move = move({
          startingDegrees: Util.getRandomInRange(0, 360),
          playerCountFactor,
        })
        player.behaviors.collisionChecker = collisionChecker(player.id, playerCountFactor)

        // Enable the following behaviour for keyboard debugging
        // player.behaviors.player1Keyboard = player1Keyboard()
        const controller = Entity.addChild(player, { id: `${player.id}controller` })
        controller.direction = null
      })
    })
}

export const getMatchWinners = (players, scoreNeeded) =>
  R.compose(
    R.filter(R.compose(
      R.flip(R.gte)(scoreNeeded),
      R.view(R.lensProp('score')),
    )),
    Object.values,
  )(players)

export const scoreToWin = players => (playerCount(players) - 1) * 5

export const resetPlayerScore = (acc, player) => {
  acc[player.playerId] = { ...player, score: 0 }
  return acc
}

export const resetPlayersScore = players => R.compose(
  R.reduce(resetPlayerScore, {}),
  Object.values,
)(players)

export const calculatePlayerScores = ({ lastRoundResult: { playerFinishOrder } }) =>
  R.zip(R.range(0, playerFinishOrder.length), playerFinishOrder)

export const applyPlayerScores = (players, scores) =>
  scores.reduce((acc, [score, playerId]) => {
    const player = players[playerId]
    acc[playerId] = {
      ...player,
      score: player.score + score,
    }
    return acc
  }, {})

const getStartingPosition = Util.grid({
  x:           150,
  y:           150,
  marginX:     200,
  marginY:     300,
  itemsPerRow: 5,
})

const createPlayer = R.curry((playerCountFactor, index, { playerId, spriteId, color }) => {
  const { x, y } = getStartingPosition(index)

  const square = Entity.addChild(
    Entity.getRoot(),
    {
      id:     playerId,
      x,
      y,
      width:  PLAYER_HITBOX_SIZE * (1 / playerCountFactor),
      height: PLAYER_HITBOX_SIZE * (1 / playerCountFactor),
    },
  )
  square.events = new EventEmitter()

  square.events.on(GAME_EVENTS.PLAYER_COLLISION, () =>
    gameState
      .controllers[playerId]
      .send({
        event:   EVENTS.RTC.PLAYER_DIED,
        payload: {},
      }))

  Entity.addType(square, 'player')

  square.color = color
  square.isAlive = true
  square.spriteId = spriteId

  return square
})

const bouncePlayers = (players, playerCountFactor) => new Promise((resolve) => {
  const bouncer = Entity.addChild(Entity.getRoot())
  bouncer.behaviors.bouncePlayers = {
    timer: Timer.create({ duration: Math.floor(TOTAL_BOUNCE_DURATION / players.length) + 15 }),
    index: 0,
    run:   (b) => {
      if (Timer.run(b.timer)) {
        const player = players[b.index]

        const sprite = Sprite.show(
          player,
          { texture: player.spriteId },
        )
        sprite.scale.set(1 / playerCountFactor)

        // Offset the sprite so that the entity hitbox is in the middle
        sprite.anchor.set((1 - (player.width / sprite.width)) / 2)

        player.behaviors.bounce = bounce()

        b.index += 1
        Timer.reset(b.timer)

        if (b.index === players.length) {
          Entity.destroy(bouncer)
          resolve()
        }
      }
    },
  }
})

const toRadians = angle => angle * (Math.PI / 180)

const move = ({ startingDegrees, playerCountFactor }) => ({
  init: (b, e) => {
    e.degrees = startingDegrees
  },
  run: (b, e) => {
    const radians = toRadians(e.degrees)
    const y = Math.sin(radians)
    const x = Math.cos(radians)
    e.x += (x * SPEED_MULTIPLIER) / playerCountFactor
    e.y += (y * SPEED_MULTIPLIER) / playerCountFactor
  },
})

const pivot = playerId => ({
  run: (b, e) => {
    if (Entity.get(`${playerId}controller`).direction === RIGHT) {
      if (e.degrees >= 360) {
        e.degrees = 0
        return
      }
      e.degrees += TURN_RADIUS
    } else if (Entity.get(`${playerId}controller`).direction === LEFT) {
      if (e.degrees < 0) {
        e.degrees = 360
        return
      }
      e.degrees -= TURN_RADIUS
    } else {
      // Do nothing
    }
  },
})

const createTrail = (playerCountFactor, playerId, spriteId, holeGenerator) => ({
  timer: Timer.create({ duration: Math.ceil(2) }),
  run:   (b, e) => {
    if (holeGenerator.preventTrail) {
      return
    }
    const width = TRAIL_HITBOX_SIZE * (1 / playerCountFactor)
    const height = TRAIL_HITBOX_SIZE * (1 / playerCountFactor)

    // Find the middle of the player entity so that
    // we can put the trails' middle point in the same spot
    const middleX = Entity.getX(e) + (e.width / 2)
    const middleY = Entity.getY(e) + (e.height / 2)

    if (Timer.run(b.timer)) {
      const trailE = Entity.addChild(
        Entity.getRoot(),
        {
          x: middleX - (width / 2),
          y: middleY - (height / 2),
          width,
          height,
        },
      )
      trailE.active = false
      trailE.player = playerId
      Entity.addType(trailE, 'trail')
      const sprite = Sprite.show(
        trailE,
        { texture: spriteId },
      )
      sprite.scale.set(1 / playerCountFactor)
      Timer.reset(b.timer)

      trailE.behaviors.activate = activate()
    }
  },
})

const holeGenerator = playerCountFactor => ({
  preventTrail:      false,
  generateHoleTimer: Timer
    .create({
      duration: Util.getRandomInRange(
        GENERATE_HOLE_MIN_TIME,
        GENERATE_HOLE_MAX_TIME,
      ),
    }),
  holeLengthTimer: null,
  run:             (b) => {
    if (b.generateHoleTimer && Timer.run(b.generateHoleTimer)) {
      b.preventTrail = true

      const rand = Util.getRandomInRange(
        Math.ceil(HOLE_LENGTH_MIN_TIME * playerCountFactor),
        Math.ceil(HOLE_LENGTH_MAX_TIME * playerCountFactor),
      )
      b.holeLengthTimer = Timer.create({ duration: rand })

      b.generateHoleTimer = null
    } else if (b.holeLengthTimer && Timer.run(b.holeLengthTimer)) {
      b.preventTrail = false

      const rand = Util.getRandomInRange(
        GENERATE_HOLE_MIN_TIME,
        GENERATE_HOLE_MAX_TIME,
      )
      b.generateHoleTimer = Timer.create({ duration: rand })

      b.holeLengthTimer = null
    }
  },
})

/*
 * This behavior is needed so that the player wont immediately collide with its own tail.
 */
const activate = () => ({
  timer: Timer.create({ duration: 15 }),
  run:   (b, e) => {
    if (Timer.run(b.timer)) {
      e.active = true
    }
  },
})

const killPlayer = (e, playerCountFactor) => {
  const particles = Entity.addChild(e)

  Particles.emit(particles, {
    ...explode({
      degrees:     e.degrees,
      scaleFactor: playerCountFactor,
      radius:      e.width,
      x:           Entity.getX(e) + (e.width / 2),
      y:           Entity.getY(e) + (e.height / 2),
    }),
    zIndex: layers.FOREGROUND,
  })

  const sound = Entity.addChild(e)

  Sound.play(sound, { src: './sounds/explosion.wav', volume: 0.6 })

  e.killed = true
  /* eslint-disable fp/no-delete */
  delete e.behaviors.collisionChecker
  delete e.behaviors.holeGenerator
  delete e.behaviors.createTrail
  delete e.behaviors.move
  delete e.behaviors.pivot
  /* eslint-enable fp/no-delete */

  e.events.emit(GAME_EVENTS.PLAYER_COLLISION)
}

const collisionChecker = (playerId, playerCountFactor) => ({
  timer: Timer.create({ duration: 2 }),
  run:   (b, e) => {
    if (Timer.run(b.timer)) {
      const allTrails = Entity
        .getByType('trail')
        .filter(t => t.active || t.player !== playerId)

      if (allTrails.some(t => Entity.isColliding(t, e))) {
        killPlayer(e, playerCountFactor)
      } else if (
        Entity.getX(e) < WALL_THICKNESS ||
        Entity.getX(e) > GAME_WIDTH - WALL_THICKNESS - e.width ||
        Entity.getY(e) < WALL_THICKNESS ||
        Entity.getY(e) > GAME_HEIGHT - WALL_THICKNESS - e.height) {
        killPlayer(e, playerCountFactor)
        log('PLAYER DIED DUE TO OUT OF BOUNDS!')
      }
      const playersAlive = Entity
        .getByType('player')
        .filter(p => !p.killed)

      if (playersAlive.length === 1 && gameState.started) {
        gameState.started = false
        gameState.lastRoundResult.winner = playersAlive[0].color
        gameState.lastRoundResult.playerFinishOrder =
          gameState.lastRoundResult.playerFinishOrder.concat([playersAlive[0].id])
        transitionToRoundEnd()
      }
      Timer.reset(b.timer)
    }
  },
})

const createWalls = () => {
  const walls = Entity.addChild(Entity.getRoot())
  const graphics = Graphics.create(walls)
  graphics.lineStyle(WALL_THICKNESS, WALL_COLOR, 1)

  graphics.moveTo(0, 0)
  graphics.lineTo(GAME_WIDTH, 0)
  graphics.lineTo(GAME_WIDTH, GAME_HEIGHT)
  graphics.lineTo(0, GAME_HEIGHT)
  graphics.lineTo(0, 0)
}
