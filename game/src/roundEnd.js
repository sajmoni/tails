import { Entity, Timer, Text } from 'l1'
import { Color } from 'common'
import { createEaseInAndOut } from './magic'
import { calculatePlayerScores, applyPlayerScores } from './game'
import { gameState, GAME_WIDTH } from '.'
import * as TextStyle from './util/TextStyle'
import Layer from './util/Layer'
import Scene from './Scene'
import { transitionToScoreScene } from './score'

const TIME_UNTIL_ROUND_END_RESTARTS = 240

export const transitionToRoundEnd = () => {
  gameState.started = false
  const scores = calculatePlayerScores(gameState)
  gameState.players = applyPlayerScores(gameState.players, scores)

  const { winner } = gameState.lastRoundResult

  const roundEnd = Entity.addChild(
    Entity.get(Scene.GAME),
    {
      id: Scene.ROUND_END,
      x:  -300,
      y:  200,
    },
  )
  const text = Text.show(
    roundEnd,
    {
      text:   `Winner is ${winner}!`,
      zIndex: Layer.FOREGROUND + 10,
      style:  {
        ...TextStyle.BIG,
        fill: Color[winner],
      },
    },
  )

  text.anchor.set(0.5)
  roundEnd.behaviors.winnerTextAnimation = roundWinnerTextAnimation()

  roundEnd.behaviors.pause = pauseAndTransitionToScoreScene()
}

const pauseAndTransitionToScoreScene = () => ({
  timer: Timer.create({ duration: TIME_UNTIL_ROUND_END_RESTARTS }),
  run:   ({ timer }) => {
    if (Timer.run(timer)) {
      Entity.destroy(Scene.GAME)
      transitionToScoreScene()
    }
  },
})

const roundWinnerTextAnimation = () => ({
  tick: 0,
  init: (b, e) => {
    b.animation = createEaseInAndOut({
      start:    -(e.asset.width / 2),
      end:      GAME_WIDTH + (e.asset.width / 2),
      duration: 120,
    })
  },
  run: (b, e) => {
    e.x = b.animation(b.tick)
    b.tick += 1
  },
})

window.debug = {
  ...window.debug,
  transitionToRoundEnd,
}
