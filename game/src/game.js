import { shuffle } from 'lodash/fp'
import R from 'ramda'
import { Entity, Util, Timer, Game, Sound, Sprite, Particles } from 'l1'
import { COLORS } from 'common'
import EventEmitter from 'eventemitter3'
import { LEFT, RIGHT, GAME_WIDTH, GAME_HEIGHT, gameState, playerCount } from '.'
import deathExplosion from './particleEmitterConfigs/deathExplosion.json'
import { transitionToRoundEnd } from './roundEnd'

const { log } = console

const TURN_RADIUS = 3
const SPEED_MULTIPLIER = 3.6

const GENERATE_HOLE_MAX_TIME = 300
const GENERATE_HOLE_MIN_TIME = 60

const HOLE_LENGTH_MAX_TIME = 30
const HOLE_LENGTH_MIN_TIME = 10

const WALL_THICKNESS = 6
const WALL_COLOR = 0xffffff

export const EVENTS = { PLAYER_COLLISION: 'player.collision' }
const PLAYER_HITBOX_SIZE = 12

export function transitionToGameScene(maxPlayers) {
  Entity.getAll()
    .filter(e => e.id !== 'background')
    .forEach(Entity.destroy)

  const playerCountFactor = R.compose(
    Math.sqrt,
    playerCount,
  )(gameState.players)

  R.compose(
    R.zipWith(createPlayer(playerCountFactor), shuffle(R.range(0, maxPlayers))),
    shuffle,
    Object.values,
  )(gameState.players)

  const walls = Entity.addChild(Entity.getRoot())
  walls.behaviors.renderWalls = renderWalls()
}

export const getMatchWinners = (players, scoreNeeded) =>
  R.compose(
    R.filter(R.compose(
      R.flip(R.gte)(scoreNeeded),
      R.view(R.lensProp('score')),
    )),
    Object.values,
  )(players)

export function scoreToWin(players) {
  return (playerCount(players) - 1) * 5
}

export const resetPlayerScore = player => ({ ...player, score: 0 })
export const resetPlayersScore = players => R.compose(
  R.map(resetPlayerScore),
  Object.values,
)(players)

export function calculatePlayerScores({ lastRoundResult: { playerFinishOrder } }) {
  return R.zip(R.range(0, playerFinishOrder.length), playerFinishOrder)
}

export function applyPlayerScores(players, scores) {
  return scores.reduce((acc, [score, playerId]) => {
    const player = players[playerId]
    acc[playerId] = {
      ...player,
      score: player.score + score,
    }
    return acc
  }, {})
}

const createPlayer = R.curry((playerCountFactor, index, { playerId, spriteId, color }) => {
  const x = 150 + ((index % 5) * 200)
  const y = 150 + (index > 4 ? 300 : 0)

  const square = Entity.addChild(
    Entity.getRoot(),
    {
      id:     playerId,
      x,
      y,
      width:  PLAYER_HITBOX_SIZE,
      height: PLAYER_HITBOX_SIZE,
    },
  )
  square.events = new EventEmitter()
  Entity.addType(square, 'player')

  const sprite = Sprite.show(
    square,
    { texture: spriteId },
  )
  sprite.scale.set(1 / playerCountFactor)

  square.color = color
  square.isAlive = true
  square.behaviors.startPlayerMovement = startPlayerMovement(
    playerCountFactor,
    square,
    playerId,
    spriteId,
  )
})

const startPlayerMovement = (playerCountFactor, player, playerId, spriteId) => ({
  timer: Timer.create({ duration: 60 }),
  run:   (b) => {
    if (Timer.run(b.timer)) {
      player.behaviors.pivot = pivot(playerId)
      player.behaviors.holeGenerator = holeGenerator(playerCountFactor)
      player.behaviors.createTrail = createTrail(
        playerCountFactor,
        playerId,
        spriteId,
        player.behaviors.holeGenerator,
      )
      player.behaviors.move = move({
        startingDegrees: Util.getRandomInRange(0, 360),
        playerCountFactor,
      })
      player.behaviors.collisionChecker = collisionChecker(playerId)

      // Enable the following behaviour for keyboard debugging
      // square.behaviors.player1Keyboard = player1Keyboard()
      const controller = Entity.addChild(player, { id: `${playerId}controller` })
      controller.direction = null
    }
  },
})

function toRadians(angle) {
  return angle * (Math.PI / 180)
}

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
    if (Timer.run(b.timer)) {
      const trailE = Entity.addChild(
        Entity.getRoot(),
        {
          x:      Entity.getX(e) + ((e.asset.width / 2) - (e.asset.width / 2)),
          y:      Entity.getY(e) + ((e.asset.height / 2) - (e.asset.height / 2)),
          width:  PLAYER_HITBOX_SIZE,
          height: PLAYER_HITBOX_SIZE,
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

const killPlayer = (e) => {
  const updatedDeathExplosion = {
    ...deathExplosion,
    pos: {
      x: Entity.getX(e),
      y: Entity.getY(e),
    },
    startRotation: {
      min: e.degrees - 30,
      max: e.degrees + 30,
    },
    color: {
      start: COLORS[e.color],
      end:   COLORS[e.color],
    },
  }

  const particles = Entity.addChild(e)

  Particles.emit(particles, {
    textures: ['particle'],
    config:   updatedDeathExplosion,
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
}

const collisionChecker = playerId => ({
  timer: Timer.create({ duration: 2 }),
  run:   (b, e) => {
    if (Timer.run(b.timer)) {
      const allTrails = Entity
        .getByType('trail')
        .filter(t => t.active || t.player !== playerId)

      if (allTrails.some(t => Entity.isColliding(t, e))) {
        e.events.emit(EVENTS.PLAYER_COLLISION)
        killPlayer(e, playerId)
      } else if (
        Entity.getX(e) < WALL_THICKNESS ||
        Entity.getX(e) > GAME_WIDTH - WALL_THICKNESS - e.asset.width ||
        Entity.getY(e) < WALL_THICKNESS ||
        Entity.getY(e) > GAME_HEIGHT - WALL_THICKNESS - e.asset.height) {
        killPlayer(e, playerId)
        e.events.emit(EVENTS.PLAYER_COLLISION)
        log('PLAYER DIED DUE TO OUT OF BOUNDS!')
      }
      const playersAlive = Entity.getByType('player').filter(p => !p.killed)
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

const renderWalls = () => ({
  run: () => {
    const graphics = Game.getGraphics()
    graphics.lineStyle(WALL_THICKNESS, WALL_COLOR, 1)

    graphics.moveTo(0, 0)
    graphics.lineTo(GAME_WIDTH, 0)
    graphics.lineTo(GAME_WIDTH, GAME_HEIGHT)
    graphics.lineTo(0, GAME_HEIGHT)
    graphics.lineTo(0, 0)
  },
})
