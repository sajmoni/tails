import { Entity, Sound, Util, Sprite, Text, Graphics } from 'l1'
import _ from 'lodash/fp'
import { COLORS } from 'common'
import { getRatio, playerCount, gameState, GAME_WIDTH, GAME_HEIGHT, MAX_PLAYERS_ALLOWED } from '.'
import { code, big, small } from './util/textStyles'
import { scoreToWin, GAME_COLORS } from './game'
import layers from './util/layers'
import bounce from './bounce'

const CONTROLLER_PORT = '4001'

const TITLE_BACKGROUND_HEIGHT = 120

const deployedURLs = {
  'game.rymdkraftverk.com': 'rymdkraftverk.com',
}

const getControllerUrl = () => {
  const {
    location: {
      hostname,
      port,
    },
  } = window

  return port ? `${hostname}:${CONTROLLER_PORT}` : deployedURLs[hostname]
}

const getPlayerPosition = Util.grid({
  x:           480,
  y:           400,
  marginX:     150,
  marginY:     150,
  itemsPerRow: 5,
})

export function transitionToLobby(gameCode, alreadyConnectedPlayers = []) {
  Entity.getAll()
    .filter(e => e.id !== 'background')
    .forEach(Entity.destroy)

  createGoalDescription()

  createText({
    x:     50,
    y:     30,
    text:  'LOBBY',
    style: { ...big, fill: 'white', fontSize: 48 * getRatio() },
    size:  48,
  })

  createText({
    x:     50,
    y:     340,
    text:  'Go to:',
    style: { ...small, fill: 'white', fontSize: small.fontSize * getRatio() },
    size:  small.fontSize,
  })

  createText({
    x:     50,
    y:     370,
    text:  getControllerUrl(),
    style: { ...code, fontSize: 30 * getRatio() },
    size:  30,
  })


  createText({
    x:     50,
    y:     480,
    text:  'Code:',
    style: { ...small, fontSize: small.fontSize * getRatio(), fill: 'white' },
    size:  small.fontSize,
  })

  createText({
    x:     50,
    y:     520,
    text:  gameCode,
    style: { ...code, fontSize: code.fontSize * getRatio() },
    size:  code.fontSize,
  })

  createText({
    x:     GAME_WIDTH - 230,
    y:     GAME_HEIGHT - 48,
    text:  '© Rymdkraftverk 2018',
    style: { ...code, fontSize: 20 * getRatio() },
    size:  20,
  })

  const titleBackground = Entity.addChild(Entity.getRoot())
  const titleBackgroundGraphics = Graphics
    .create(titleBackground, { zIndex: layers.BACKGROUND + 10 })

  titleBackgroundGraphics.beginFill(GAME_COLORS.BLUE)
  titleBackgroundGraphics.moveTo(0, 0)
  titleBackgroundGraphics.lineTo(GAME_WIDTH, 0)
  titleBackgroundGraphics.lineTo(GAME_WIDTH, TITLE_BACKGROUND_HEIGHT)
  titleBackgroundGraphics.lineTo(0, TITLE_BACKGROUND_HEIGHT)
  titleBackgroundGraphics.lineTo(0, 0)
  titleBackgroundGraphics.endFill()

  _
    .times(index => alreadyConnectedPlayers[index], MAX_PLAYERS_ALLOWED)
    .forEach((player, index) => {
      if (player) {
        createPlayerEntity(player, index, { newPlayer: false })
      }
      createOutline(index)
    })
}

function createOutline(index) {
  const { x, y } = getPlayerPosition(index)

  const e = Entity.addChild(
    Entity.getRoot(),
    {
      id: `outline-${index}`,
      x,
      y,
    },
  )
  const sprite = Sprite.show(e, {
    texture: 'square-outline',
    zIndex:  layers.BACKGROUND + 10,
  })
  sprite.scale.set(3)
  sprite.anchor.set(0.5)
}

function createGoalDescription() {
  const e = Entity.get('goal-description')
  if (e) {
    Entity.destroy(e)
  }

  const { players } = gameState
  const score = scoreToWin(players)
  const numOfPlayers = playerCount(players)
  if (numOfPlayers < 2) {
    return
  }

  const entity = Entity.addChild(
    Entity.getRoot(),
    {
      id: 'goal-description',
      x:  510,
      y:  200,
    },
  )

  const textAsset = Text.show(
    entity,
    {
      text:  `First to ${score} wins!`,
      style: { ...big, fontSize: big.fontSize * getRatio(), fill: 'white' },
    },
  )
  textAsset.scale.set(1 / getRatio())
  entity.originalSize = big.fontSize
}

function createText({
  x, y, text, style, size,
}) {
  const textEntity = Entity.addChild(
    Entity.getRoot(),
    {
      x,
      y,
    },
  )

  const textAsset = Text.show(
    textEntity,
    {
      text,
      style,
    },
  )
  textAsset.scale.set(1 / getRatio())

  textEntity.originalSize = size
}

export function addPlayerToLobby(newPlayer) {
  const numOfPlayers = playerCount(gameState.players)
  const color = Object.keys(COLORS)[numOfPlayers]
  const player = {
    ...newPlayer,
    spriteId: `square-${color}`,
    score:    0,
    color,
  }

  gameState.players[player.playerId] = player
  createPlayerEntity(player, numOfPlayers, { newPlayer: true })

  return player
}

function createPlayerEntity({ color, score }, playerIndex, { newPlayer }) {
  const { x, y } = getPlayerPosition(playerIndex)
  const square = Entity.addChild(
    Entity.getRoot(),
    {
      id: `square-${color}`,
      x,
      y,
    },
  )
  const sprite = Sprite.show(square, { texture: `square-${color}` })
  sprite.scale.set(3)
  sprite.anchor.set(0.5)

  const squareScore = Entity.addChild(
    square,
    {
      id: `square-score-${color}`,
      x:  -15,
      y:  -15,
    },
  )

  const squareScoreText = Text.show(
    squareScore,
    {
      text:  score,
      style: {
        ...small,
        fontSize: small.fontSize * getRatio(),
        fill:     'white',
      },
      zIndex: 1,
    },
  )

  squareScoreText.scale.set(1 / getRatio())
  squareScore.originalSize = small.fontSize

  if (newPlayer) {
    square.behaviors.bounce = bounce()
    const joinSounds = [
      'join1',
      'join2',
      'join3',
    ]
    const joinSound = joinSounds[Util.getRandomInRange(0, 3)]
    createGoalDescription()

    const sound = Entity.addChild(square)
    Sound.play(sound, { src: `./sounds/${joinSound}.wav`, volume: 0.6 })
  }
}
