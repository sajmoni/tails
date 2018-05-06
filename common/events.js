const EVENTS = {
  CREATE:                'game.create',
  CREATED:               'game.created',
  GAME_START:            'game.start',
  GAME_STARTED:          'game.started',
  ANSWER:                'game.join.answer',
  OFFER:                 'game.join.offer',
  CONTROLLER_CANDIDATE:  'game.join.controller.candidate',
  GAME_CANDIDATE:        'game.join.game.candidate',
  PLAYER_MOVEMENT:       'player.movement',
  PLAYER_JOINED:         'player.joined',
}

module.exports = EVENTS;
