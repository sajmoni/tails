import React, { Component, Fragment } from 'react'
import PropTypes from 'prop-types'
import { Color } from 'common'
import styled, { css } from 'styled-components'

const Container = styled.div`
  display: flex;
  flex-direction: column;
  height: 100vh;
  touch-action: manipulation;
  background-color: ${({ backgroundColor }) => backgroundColor};
`

const StartGameContainer = styled.div`
`

const label = css`
  user-select: none;
  height: 30vh;
  font-family: inherit;
  display: flex;
  align-items: center;
  justify-content: center;
`

const StartGameButton = styled.div`
  ${label};
  touch-action: manipulation;
`

const AwaitingPlayers = styled.div`
  ${label};
`

const playerColorToBackgroundColor = (player) => {
  const background = Color[player]
  return background || 'white'
}

class GameLobby extends Component {
  render() {
    const {
      playerColor,
      playerCount,
      startGame,
    } = this.props

    return (
      <Container
        backgroundColor={playerColorToBackgroundColor(playerColor)}
      >
        {
          playerCount > 1
            ?
              <StartGameContainer>
                <div>
                  {`
                    Your phone is the controller
                  `}
                </div>
                <div>
                  {`
                    The game is played on the other screen
                  `}
                </div>
                <div>
                  {`
                    Press start when ready
                  `}
                </div>
                <StartGameButton
                  onClick={startGame}
                >
                Start Game!
                </StartGameButton>
              </StartGameContainer>
            :
              <AwaitingPlayers>
                Awaiting more players...
              </AwaitingPlayers>
        }
      </Container>
    )
  }
}

GameLobby.propTypes = {
  playerColor: PropTypes.string.isRequired,
  playerCount: PropTypes.number,
  startGame:   PropTypes.func.isRequired,
}

export default GameLobby
