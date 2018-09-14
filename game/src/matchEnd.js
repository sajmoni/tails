import { Entity, Timer, Text, Particles, Util } from 'l1'
import { Event, Color, Channel } from 'common'

import { GAME_WIDTH, GAME_HEIGHT } from './rendering'
import { createSine } from './magic'
import { resetPlayersScore, getPlayersWithHighestScore } from './game'
import firework from './particleEmitter/firework'
import { transitionToLobby } from './lobby'
import * as TextStyle from './util/textStyle'
import Layer from './util/layer'
import Scene from './Scene'
import gameState from './gameState'
import Nordgrona from './nordgrona'

const TIME_UNTIL_LOBBY_TRANSITION = 500

const createText = (entity, content, color) => {
  const text = Text.show(
    entity,
    {
      text:     content,
      fontSize: 38,
      zIndex:   Layer.FOREGROUND,
      style:    {
        ...TextStyle.BIG,
        fill: color,
      },
    },
  )
  text.anchor.set(0.5)

  return text
}

const createTextDraw = matchEndEntity => createText(matchEndEntity, 'It\'s a draw, better luck next time!', 'white')
const createTextWinner = (matchEndEntity, [{ color }]) => createText(matchEndEntity, `${Nordgrona[color]} is the champion!`, Color[color])

export const transitionToMatchEnd = () => {
  Entity
    .getAll()
    .filter(e => e.id !== 'background')
    .map(Entity.destroy)

  const matchEnd = Entity.addChild(
    Entity.getRoot(),
    {
      id: Scene.MATCH_END,
      x:  GAME_WIDTH / 2,
      y:  200,
    },
  )

  const { players } = gameState
  const matchWinners = getPlayersWithHighestScore(players)

  if (matchWinners.length === 1) {
    const winnerTextEntity = Entity.addChild(matchEnd)
    createTextWinner(winnerTextEntity, matchWinners)
    winnerTextEntity.behaviors.textMovement = textMovement()

    const fireworkCreator = Entity.addChild(matchEnd)
    fireworkCreator.behaviors.createFireworks = createFireworks(matchWinners[0].color)
  } else {
    createTextDraw(matchEnd)
  }

  matchEnd.behaviors.pause = pause()
}

const textMovement = () => ({
  sine: createSine({
    start: 1,
    end:   1.2,
    speed: 120,
  }),
  tick: 0,
  init: (b, e) => {
    b.originalSize = e.asset.style.fontSize
  },
  run: (b, e) => {
    const scale = b.sine(b.tick)
    b.tick += 1
    Text.scale(e, b.originalSize * scale)
  },
})

const createFireworks = color => ({
  timer: Timer.create({ duration: Util.getRandomInRange(5, 10) }),
  run:   (b, e) => {
    if (Timer.run(b.timer)) {
      const particles = Entity.addChild(e)
      const x = Util.getRandomInRange(100, GAME_WIDTH - 100)
      const y = Util.getRandomInRange(100, GAME_HEIGHT - 100)
      Particles.emit(particles, {
        ...firework({
          color,
          x,
          y,
        }),
        zIndex: Layer.BACKGROUND,
      })
      Timer.reset(b.timer)
    }
  },
})

const pause = () => ({
  timer: Timer.create({ duration: TIME_UNTIL_LOBBY_TRANSITION }),
  run:   ({ timer }) => {
    if (Timer.run(timer)) {
      Object
        .values(gameState.controllers)
        .forEach((controller) => {
          controller.send(Channel.RELIABLE, { event: Event.Rtc.ROUND_END, payload: {} })
        })

      gameState.players = resetPlayersScore(gameState.players)

      Entity.destroy(Scene.MATCH_END)

      transitionToLobby(gameState.gameCode, Object.values(gameState.players))
    }
  },
})

window.debug = {
  ...window.debug,
  transitionToLobby,
  transitionToMatchEnd,
}
