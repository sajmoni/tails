import l1 from 'l1'
import R from 'ramda'
import Scene from './Scene'
import explode from './particleEmitter/explode'
import { transitionToRoundEnd } from './roundEnd'
import gameState, { CurrentState } from './gameState'
import Layer from './util/layer'
import { GAME_WIDTH, GAME_HEIGHT } from './rendering'
import GameEvent from './util/gameEvent'

const GENERATE_HOLE_MAX_TIME = 300
const GENERATE_HOLE_MIN_TIME = 60

const HOLE_LENGTH_MAX_TIME = 30
const HOLE_LENGTH_MIN_TIME = 10

export const createTrail = ({
  playerId, speed, speedMultiplier,
}) => ({
  id:      'createTrail',
  endTime: 2,
  loop:    true,
  onInit:  ({ data }) => {
    data.parent = l1.container({ parent: l1.get(Scene.GAME) })
  },
  onComplete: ({ entity, data }) => {
    if (entity.preventTrail) {
      return
    }

    // Find the middle of the player entity so that
    // we can put the trails' middle point in the same spot
    const middleX =
      (entity
        .asset
        .toGlobal(new l1.PIXI.Point(0, 0)).x / l1.getScreenScale()) +
          (entity.asset.hitArea.width / 2)

    const middleY =
      (entity
        .asset
        .toGlobal(new l1.PIXI.Point(0, 0)).y / l1.getScreenScale()) +
          (entity.asset.hitArea.height / 2)

    const trailE = l1.sprite({
      parent:  data.parent,
      types:   ['trail'],
      texture: `circle-${entity.color}`,
    })

    trailE.active = false
    trailE.player = playerId

    trailE.asset.scale.set(speed / speedMultiplier / 2)
    trailE.asset.x = middleX - (trailE.asset.width / 2)
    trailE.asset.y = middleY - (trailE.asset.height / 2)

    l1.addBehavior(
      trailE,
      activate(),
    )
  },
})

/*
 * This behavior is needed so that the player wont immediately collide with its own tail.
 */
const activate = () => ({
  endTime:    15,
  onComplete: ({ entity }) => {
    entity.active = true
  },
})

const holeMaker = (speed, speedMultiplier) => ({
  id:      'holeMaker',
  endTime: l1.getRandomInRange(
    Math.ceil(HOLE_LENGTH_MIN_TIME * (speedMultiplier / speed)),
    Math.ceil(HOLE_LENGTH_MAX_TIME * (speedMultiplier / speed)),
  ),
  onInit: ({ entity }) => {
    entity.preventTrail = true
  },
  onRemove: ({ entity }) => {
    entity.preventTrail = false
    l1.addBehavior(
      entity,
      createHoleMaker(speed, speedMultiplier),
    )
  },
})

export const createHoleMaker = (speed, speedMultiplier) => ({
  id:      'createHoleMaker',
  endTime: l1.getRandomInRange(
    GENERATE_HOLE_MIN_TIME,
    GENERATE_HOLE_MAX_TIME,
  ),
  onRemove: ({ entity }) => {
    l1.addBehavior(
      entity,
      holeMaker(speed, speedMultiplier),
    )
  },
})

export const collisionCheckerTrail = (playerId, speedMultiplier) => ({
  id:         'collisionCheckerTrail',
  endTime:    2,
  loop:       true,
  onComplete: ({ entity }) => {
    const allTrails = l1
      .getByType('trail')
      .filter(t => t.active || t.player !== playerId)

    if (allTrails.some(l1.isColliding(entity))) {
      killPlayer(entity, speedMultiplier)
      checkPlayersAlive()
    }
  },
})

const killPlayer = (entity, speedMultiplier) => {
  l1.particles({
    ...explode({
      degrees:     entity.degrees,
      scaleFactor: (speedMultiplier / entity.speed) / 4,
      radius:      entity.asset.width * 2,
      x:           0,
      y:           0,
    }),
    zIndex: Layer.FOREGROUND + 1,
    parent: entity,
  })

  l1.sound({
    src:    './sounds/explosion.wav',
    volume: 0.6,
    parent: entity,
  })

  entity.killed = true

  const behaviorsToRemove = [
    'collisionCheckerTrail',
    'collisionCheckerWalls',
    'createHoleMaker',
    'holeMaker',
    'createTrail',
    'move',
    'pivot',
  ]

  R.forEach(
    l1.removeBehavior(entity),
    behaviorsToRemove,
  )

  gameState.events.emit(GameEvent.PLAYER_COLLISION, entity.color)
  entity.event.emit(GameEvent.PLAYER_COLLISION)
}

export const collisionCheckerWalls = ({
  speedMultiplier, wallThickness,
}) => ({
  id:         'collisionCheckerWalls',
  endTime:    2,
  loop:       true,
  onComplete: ({ entity }) => {
    const x = entity.asset.toGlobal(new l1.PIXI.Point(0, 0)).x / l1.getScreenScale()
    const y = entity.asset.toGlobal(new l1.PIXI.Point(0, 0)).y / l1.getScreenScale()
    if (
      x < wallThickness ||
      x > GAME_WIDTH - wallThickness - entity.asset.hitArea.width ||
      y < wallThickness ||
      y > GAME_HEIGHT - wallThickness - entity.asset.hitArea.height) {
      killPlayer(entity, speedMultiplier)
      checkPlayersAlive()
    }
  },
})

const checkPlayersAlive = () => {
  const playersAlive = l1
    .getByType('player')
    .filter(p => !p.killed)

  if (playersAlive.length === 1 && gameState.currentState === CurrentState.PLAYING_ROUND) {
    gameState.lastRoundResult.winner = playersAlive[0].color
    gameState.lastRoundResult.playerFinishOrder =
            gameState.lastRoundResult.playerFinishOrder.concat([playersAlive[0].id])

    transitionToRoundEnd()
  }
}
