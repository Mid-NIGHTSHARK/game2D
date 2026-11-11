// Configuration constants for Rillkeepers

export const CONFIG = {
  TILE_SIZE: 16,
  MAP_COLS: 40,
  MAP_ROWS: 30,
  GAME_WIDTH: 40 * 16,  // 640px
  GAME_HEIGHT: 30 * 16, // 480px

  PLAYER_SPEED: 95,
  PLAYER_CARRY_SPEED: 70,

  APP_ID: 'com.midnightshark.game2d.rillkeepers.v1',
  MAX_PLAYERS: 4,

  SIMULATION_HZ: 20,
  SNAPSHOT_HZ: 10,
  INPUT_HZ: 20,

  COLOR_NAMES: ['Teal (River)', 'Rust (Autumn)', 'Olive (Moss)', 'Ochre (Sun)'],
  COLOR_HEX: ['#3a7d7b', '#b35d38', '#588157', '#c29b38'],

  INTERACTION_RANGE: 40 // px
};
