import React, { Component } from 'react'
import Fullscreen from 'react-full-screen'
import { Event, Color, Channel } from 'common'
import signaling from 'signaling'

import channelConfigs from '../channelConfigs'
import LockerRoom from './LockerRoom'
import LockerRoomLoader from './LockerRoomLoader'
import GameLobby from './GameLobby'
import GamePlaying from './GamePlaying'
import PlayerDead from './PlayerDead'
import isMobileDevice from '../util/isMobileDevice'
import { getLastGameCode, setLastGameCode } from '../util/localStorage'

const { error: logError, log } = console

const { REACT_APP_WS_ADDRESS: WS_ADDRESS } = process.env
const TIMEOUT_SECONDS = 20

log('REACT_APP_WS_ADDRESS', WS_ADDRESS)

const APP_STATE = {
  LOCKER_ROOM:     'locker-room',
  GAME_CONNECTING: 'game-connecting',
  GAME_LOBBY:      'game-lobby',
  GAME_PLAYING:    'game-playing',
  PLAYER_DEAD:     'player-dead',
}

const colorState = ({ started, color }) => (
  started
    ? { appState: APP_STATE.PLAYER_DEAD }
    : {
      appState:    APP_STATE.GAME_LOBBY,
      playerColor: color,
    }
)

const errorState = message => ({
  appState: APP_STATE.LOCKER_ROOM,
  error:    message,
})

const eventState = ({ event, payload }) => {
  switch (event) {
    case Event.A_PLAYER_JOINED: return payload
    case Event.A_PLAYER_LEFT: return payload
    case Event.CONTROLLER_COLOR: return colorState(payload)
    case Event.GAME_FULL: return errorState('Game is full')
    case Event.PLAYER_DIED: return { appState: APP_STATE.PLAYER_DEAD }
    case Event.ROUND_END: return { appState: APP_STATE.GAME_LOBBY }
    case Event.ROUND_START: return { appState: APP_STATE.GAME_PLAYING }
    case Event.ROUND_STARTED: return { appState: APP_STATE.GAME_PLAYING }
    default: return null
  }
}

class App extends Component {
  state = {
    appState:    APP_STATE.LOCKER_ROOM,
    fullscreen:  false,
    gameCode:    '',
    playerColor: null,
    error:       '',
  }

  componentDidMount = () => {
    this.alertIfNoRtc()
    navigator.vibrate(1)
    const gameCode = getLastGameCode()
    this.setState({ gameCode })
  }

  onData = (message) => {
    const state = eventState(message)

    if (!state) {
      logError(`Unexpected event in message: ${message}`)
      return
    }

    this.setState(state)
  }

  onJoin = () => {
    const { gameCode } = this.state
    this.setState({ appState: APP_STATE.GAME_CONNECTING, error: '', fullscreen: true })
    setLastGameCode(gameCode)
    setTimeout(this.checkConnectionTimeout, TIMEOUT_SECONDS * 1000)
    this.connectToGame(gameCode)
  };

  displayError = (message) => {
    this.setState(errorState(message))
  }

  alertIfNoRtc = () => {
    if (typeof RTCPeerConnection === 'undefined') {
      const message =
        'Unfortunately the game cannot be played in this browser.' +
        'See list of supported browsers here: https://caniuse.com/#search=webrtc'

      // eslint-disable-next-line no-alert
      alert(message)
    }
  }

  gameCodeChange = ({ target: { value } }) =>
    this.setState({
      gameCode: value
        .substr(0, 4)
        .toUpperCase(),
    })

  checkConnectionTimeout = () => {
    if (this.state.appState === APP_STATE.GAME_CONNECTING) {
      this.displayError('Failed to connect, try again!')
    }
  };

  connectToGame(gameCode) {
    const onClose = () => {
      this.displayError('Connection closed')
    }

    signaling.runInitiator({
      channelConfigs,
      onClose,
      onData:     this.onData,
      receiverId: gameCode,
      wsAddress:  WS_ADDRESS,
    })
      .then((send) => {
        this.sendSteering = send(Channel.RELIABLE_STEERING)
        this.sendReliable = send(Channel.RELIABLE)
      })
      .catch((error) => {
        const message = {
          NOT_FOUND: `Game with code ${gameCode} not found`,
        }[error.cause]

        if (message) {
          this.displayError(message)
        } else {
          logError(error)
        }
      })
  }

  clearError = () => {
    this.setState({ error: '' })
  }

  startGame = () => {
    this.sendReliable({ event: Event.ROUND_START })
    this.setState({ appState: APP_STATE.GAME_PLAYING })
  }

  enableFullscreen = () => this.state.fullscreen && isMobileDevice()

  render() {
    if (!WS_ADDRESS) {
      // eslint-disable-next-line fp/no-throw
      throw new Error('Please set env variable REACT_APP_WS_ADDRESS')
    }

    const {
      error,
      gameCode,
      appState,
      playerColor,
      playerCount,
    } = this.state

    return (
      <Fullscreen
        enabled={this.enableFullscreen()}
        onChange={fullscreen => this.setState({ fullscreen })}
      >
        {
          appState === APP_STATE.LOCKER_ROOM
            ?
              <LockerRoom
                clearError={this.clearError}
                error={error}
                gameCodeChange={this.gameCodeChange}
                gameCode={gameCode}
                onJoin={this.onJoin}
              />
            : null
        }
        {
          appState === APP_STATE.GAME_CONNECTING
            ? <LockerRoomLoader />
            : null
        }
        {
          appState === APP_STATE.GAME_LOBBY
            ?
              <GameLobby
                startGame={this.startGame}
                playerColor={playerColor}
                playerCount={playerCount}
              />
            : null
        }
        {
          appState === APP_STATE.GAME_PLAYING
            ?
              <GamePlaying
                send={this.sendSteering}
                playerColor={Color[playerColor]}
              />
            : null
        }
        {
          appState === APP_STATE.PLAYER_DEAD
            ?
              <PlayerDead />
            : null
        }
      </Fullscreen>
    )
  }
}

export default App
