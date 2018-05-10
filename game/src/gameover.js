import { Entity, Timer } from 'l1'
import EVENTS from '../../common/events'
import { createLobby, players } from './lobby'
import { game } from '.'
import { big } from './util/text'
import { connSend } from './conn'

export function transitionToGameover(conn) {
  const gameover = Entity.create('game-over')
  const { winner } = game.lastResult
  const text = Entity.addText(gameover, `Winner is ${winner}!`, big(winner), { zIndex: 100 })
  text.position.x = 200
  text.position.y = 200

  gameover.behaviors.pause = pause()
}

const pause = () => ({
  timer: Timer.create(100),
  run:   (b) => {
    if (b.timer.run()) {
      Object
        .values(game.controllers)
        .forEach(({ controllerId }) =>
          connSend(game.conn, controllerId, { event: EVENTS.GAME_OVER, payload: {} }))

      createLobby(game.gameCode, Object.values(players))
    }
  },
})
