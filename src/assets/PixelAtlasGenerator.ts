/**
 * PixelAtlasGenerator.ts
 * Deterministic CC0 16x16 Pixel Art Sprite Atlas & Texture Generator
 * Palettes strictly conform to Earthy Subterranean standard:
 * Basalt, Slate, Timber, Dirt, Pyrite Gold, Subterranean Water, Swamp Gas, Amber Lantern.
 * Dedicated to Public Domain under CC0 1.0 Universal.
 */

export interface TextureSpec {
  name: string;
  width: number;
  height: number;
  pixels: string[];
}

export class PixelAtlasGenerator {
  // 16-color Subterranean CC0 Palette
  public static readonly PALETTE: Record<string, string> = {
    '.': 'rgba(0,0,0,0)',       // Transparent
    '0': '#141316',             // Basalt Void / Darkest Outline
    '1': '#222126',             // Dark Slate
    '2': '#3b3a42',             // Mid Slate Stone
    '3': '#52505c',             // Light Slate Highlight
    '4': '#4d3224',             // Deep Mud / Ochre Shadow
    '5': '#734c36',             // Ochre Dirt
    '6': '#663931',             // Dark Timber / Iron Bark
    '7': '#8f563b',             // Rough Timber Plank
    '8': '#b3734a',             // Timber Highlight
    '9': '#df9e28',             // Pyrite Gold Base / Brass Helmet
    'G': '#f7d060',             // Bright Gold Bullion Glint
    'W': '#2d576b',             // Deep Underground Water
    'w': '#4a8299',             // Flowing Water Crest
    'P': '#5c7a3d',             // Volatile Swamp Gas Spores
    'L': '#ffaa44',             // Amber Lantern Flame / Sparks
    'R': '#963228',             // Red Crew Tunic Dark
    'r': '#d44937',             // Red Crew Tunic Bright
    'B': '#2a5078',             // Blue Crew Tunic Dark
    'b': '#4880b8',             // Blue Crew Tunic Bright
    'F': '#e0b58d',             // Miner Skin Tone
    'S': '#9c8e82',             // Pickaxe Steel / Flintlock Iron
    's': '#cfc4ba',             // Polished Steel Glint
    'K': '#331a14',             // Powder Keg Barrel Body
    'X': '#ffffff'              // Flash White
  };

  /**
   * Helper to parse 16x16 ASCII matrix and render to an offscreen HTMLCanvasElement.
   */
  public static createCanvasFromMatrix(matrix: string[], width: number = 16, height: number = 16): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return canvas;

    ctx.imageSmoothingEnabled = false;

    for (let y = 0; y < height; y++) {
      const row = matrix[y] || '';
      for (let x = 0; x < width; x++) {
        const char = row[x] || '.';
        const color = this.PALETTE[char];
        if (color && char !== '.') {
          ctx.fillStyle = color;
          ctx.fillRect(x, y, 1, 1);
        }
      }
    }
    return canvas;
  }

  /**
   * Generates all game textures into Phaser's TextureManager
   */
  public static generateAllTextures(scene: Phaser.Scene): void {
    const textures = this.getTextureDefinitions();
    for (const spec of textures) {
      if (!scene.textures.exists(spec.name)) {
        const canvas = this.createCanvasFromMatrix(spec.pixels, spec.width, spec.height);
        scene.textures.addCanvas(spec.name, canvas);
      }
    }

    // Procedural Particle textures
    this.generateParticleTextures(scene);
  }

  private static generateParticleTextures(scene: Phaser.Scene): void {
    // 1. Spark particle (4x4)
    if (!scene.textures.exists('spark_particle')) {
      const c = document.createElement('canvas');
      c.width = 4;
      c.height = 4;
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = '#f7d060';
      ctx.fillRect(1, 0, 2, 4);
      ctx.fillRect(0, 1, 4, 2);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(1, 1, 2, 2);
      scene.textures.addCanvas('spark_particle', c);
    }

    // 2. Smoke particle (8x8)
    if (!scene.textures.exists('smoke_particle')) {
      const c = document.createElement('canvas');
      c.width = 8;
      c.height = 8;
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = 'rgba(82, 80, 92, 0.7)';
      ctx.beginPath();
      ctx.arc(4, 4, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(59, 58, 66, 0.9)';
      ctx.beginPath();
      ctx.arc(4, 4, 2, 0, Math.PI * 2);
      ctx.fill();
      scene.textures.addCanvas('smoke_particle', c);
    }

    // 3. Rubble particle (4x4)
    if (!scene.textures.exists('rubble_particle')) {
      const c = document.createElement('canvas');
      c.width = 4;
      c.height = 4;
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = '#3b3a42';
      ctx.fillRect(0, 0, 4, 4);
      ctx.fillStyle = '#52505c';
      ctx.fillRect(1, 1, 2, 2);
      scene.textures.addCanvas('rubble_particle', c);
    }

    // 4. Gold dust particle (3x3)
    if (!scene.textures.exists('gold_particle')) {
      const c = document.createElement('canvas');
      c.width = 3;
      c.height = 3;
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = '#df9e28';
      ctx.fillRect(0, 0, 3, 3);
      ctx.fillStyle = '#f7d060';
      ctx.fillRect(1, 1, 1, 1);
      scene.textures.addCanvas('gold_particle', c);
    }

    // 5. Water drop particle (4x4)
    if (!scene.textures.exists('water_particle')) {
      const c = document.createElement('canvas');
      c.width = 4;
      c.height = 4;
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = '#2d576b';
      ctx.fillRect(1, 0, 2, 4);
      ctx.fillStyle = '#4a8299';
      ctx.fillRect(1, 1, 2, 2);
      scene.textures.addCanvas('water_particle', c);
    }
  }

  private static getTextureDefinitions(): TextureSpec[] {
    return [
      // -----------------------------------------------------------------------
      // TILES (16x16)
      // -----------------------------------------------------------------------
      {
        name: 'tile_bedrock',
        width: 16,
        height: 16,
        pixels: [
          '0000000000000000',
          '0111011110111110',
          '0122112211211210',
          '0121111111111210',
          '0011000110011100',
          '0111122111121110',
          '0121122111111110',
          '0111111110111210',
          '0011100110011100',
          '0121111111112110',
          '0111122111121110',
          '0111122111111110',
          '0001111110011100',
          '0121111111111210',
          '0111112211111110',
          '0000000000000000'
        ]
      },
      {
        name: 'tile_granite',
        width: 16,
        height: 16,
        pixels: [
          '2223222223222222',
          '2333221233322122',
          '2232211223221123',
          '2222111122211123',
          '3221112222112222',
          '3322222332222221',
          '2322223333222111',
          '2222233223221122',
          '2212222222222223',
          '1112233222222333',
          '1222333322122232',
          '2222232221112222',
          '2232222211222212',
          '2333222222232111',
          '3323221222333222',
          '2222211122232222'
        ]
      },
      {
        name: 'tile_dirt',
        width: 16,
        height: 16,
        pixels: [
          '5555455555545555',
          '5445445545445455',
          '4444444544444445',
          '5455454445544455',
          '5555444555554555',
          '5445545554455445',
          '4445555444455444',
          '5444554445554454',
          '5545554455455555',
          '5445454554445445',
          '4444444444444444',
          '5455454445544455',
          '5555544555554555',
          '5445555554455445',
          '4445445444455444',
          '5555444455555555'
        ]
      },
      {
        name: 'tile_timber',
        width: 16,
        height: 16,
        pixels: [
          '6666666666666666',
          '6777877777877786',
          '6767876777876786',
          '6767876777876786',
          '6888888888888886',
          '6666666666666666',
          '6777787777787776',
          '6767787677787676',
          '6767787677787676',
          '6888888888888886',
          '6666666666666666',
          '6778777778777786',
          '6768767778767786',
          '6768767778767786',
          '6888888888888886',
          '6666666666666666'
        ]
      },
      {
        name: 'tile_gold_seam',
        width: 16,
        height: 16,
        pixels: [
          '2223222223222222',
          '2333229G33322122',
          '223229GG92322112',
          '22299GGG92211123',
          '329GG99922211222',
          '339G922332222221',
          '2399223333299111',
          '22222332239GG922',
          '2212222229GGGG93',
          '1112233229GGG933',
          '12223333229G9232',
          '2222232221199222',
          '2232222211222212',
          '2333222222232111',
          '3323221222333222',
          '2222211122232222'
        ]
      },
      {
        name: 'tile_water',
        width: 16,
        height: 16,
        pixels: [
          'WWwWWWWwWWWWwWWW',
          'WwwWWWWwwWWWWwwW',
          'WWWWWWWWWWWWWWWW',
          'WWWWwWWWWWWwWWWW',
          'WWWwwWWWWWWwwWWW',
          'WWWWWWWWWWWWWWWW',
          'wWWWWwWWWWwWWWWw',
          'wwWWwwWWWWwwWWww',
          'WWWWWWWWWWWWWWWW',
          'WWwWWWWwWWWWwWWW',
          'WwwWWWWwwWWWWwwW',
          'WWWWWWWWWWWWWWWW',
          'WWWWwWWWWWWwWWWW',
          'WWWwwWWWWWWwwWWW',
          'WWWWWWWWWWWWWWWW',
          'wWWWWWWWWwWWWWWW'
        ]
      },
      {
        name: 'tile_gas',
        width: 16,
        height: 16,
        pixels: [
          '................',
          '..P.........P...',
          '....PP...P......',
          '.....P....PP....',
          '........P...P...',
          '..P...PPP.......',
          '....PP...P...P..',
          '.....P....PP....',
          '........P...P...',
          '..PP...P....P...',
          '...P....PP......',
          '.....P...P..P...',
          '..P...P....PP...',
          '....PP...P......',
          '.....P....P.....',
          '................'
        ]
      },
      {
        name: 'tile_empty',
        width: 16,
        height: 16,
        pixels: [
          '1111111111111111',
          '1000000000000001',
          '1011000000011001',
          '1011000000011001',
          '1000000000000001',
          '1000001100000001',
          '1000001100000001',
          '1000000000000001',
          '1001100000011001',
          '1001100000011001',
          '1000000000000001',
          '1000000110000001',
          '1000000110000001',
          '1011000000000001',
          '1011000000000001',
          '1111111111111111'
        ]
      },

      // -----------------------------------------------------------------------
      // OBJECTS & INTERACTABLES
      // -----------------------------------------------------------------------
      {
        name: 'gold_crate',
        width: 16,
        height: 16,
        pixels: [
          '................',
          '..666666666666..',
          '..677777777786..',
          '..67999GG99986..',
          '..679GGGGGG986..',
          '..679GGGGGG986..',
          '..67999GG99986..',
          '..676666666686..',
          '..677777777786..',
          '..679GGGGGG986..',
          '..679GGGGGG986..',
          '..67999GG99986..',
          '..688888888886..',
          '..666666666666..',
          '................',
          '................'
        ]
      },
      {
        name: 'powder_keg',
        width: 16,
        height: 16,
        pixels: [
          '......666.......',
          '.....64446......',
          '....6KKKKK6.....',
          '...6KK000KK6....',
          '..6KKK000KKK6...',
          '..60000000006...',
          '..6KKKKKKKKK6...',
          '..6KKKKKKKKK6...',
          '..6KKKKKKKKK6...',
          '..60000000006...',
          '..6KKK000KKK6...',
          '...6KK000KK6....',
          '....6KKKKK6.....',
          '.....64446......',
          '......666.......',
          '................'
        ]
      },
      {
        name: 'powder_keg_lit_0',
        width: 16,
        height: 16,
        pixels: [
          '.....LLG........',
          '....LGXGL.......',
          '.....LL666......',
          '.....64446......',
          '....6KKKKK6.....',
          '...6KK000KK6....',
          '..6KKK000KKK6...',
          '..60000000006...',
          '..6KKKKKKKKK6...',
          '..6KKKKKKKKK6...',
          '..6KKKKKKKKK6...',
          '..60000000006...',
          '..6KKK000KKK6...',
          '...6KK000KK6....',
          '....6KKKKK6.....',
          '.....64446......'
        ]
      },
      {
        name: 'powder_keg_lit_1',
        width: 16,
        height: 16,
        pixels: [
          '....LL..........',
          '.....XGLL.......',
          '....LL666.......',
          '.....64446......',
          '....6KKKKK6.....',
          '...6KK000KK6....',
          '..6KKK000KKK6...',
          '..60000000006...',
          '..6KKKKKKKKK6...',
          '..6KKKKKKKKK6...',
          '..6KKKKKKKKK6...',
          '..60000000006...',
          '..6KKK000KKK6...',
          '...6KK000KK6....',
          '....6KKKKK6.....',
          '.....64446......'
        ]
      },

      // -----------------------------------------------------------------------
      // RED CREW MINER (Frames: Idle + 4-frame run)
      // -----------------------------------------------------------------------
      {
        name: 'miner_red_idle',
        width: 16,
        height: 16,
        pixels: [
          '................',
          '....099990......',
          '....099990LL....',
          '....0FFFF0LL....',
          '....0F0F00......',
          '....0FFFF0......',
          '...0RRRRRR0.....',
          '...0RrRrRr0.....',
          '...0RrRrRr0.....',
          '...0RrRrRr0.....',
          '...00RRRR00.....',
          '....070070......',
          '....070070......',
          '....00..00......',
          '................',
          '................'
        ]
      },
      {
        name: 'miner_red_run_0',
        width: 16,
        height: 16,
        pixels: [
          '................',
          '....099990......',
          '....099990LL....',
          '....0FFFF0LL....',
          '....0F0F00......',
          '....0FFFF0......',
          '...0RRRRRR0.....',
          '...0RrRrRr0.....',
          '...0RrRrRr0.....',
          '...0RrRrRr0.....',
          '...00RRRR00.....',
          '....070.070.....',
          '...070...070....',
          '...00.....00....',
          '................',
          '................'
        ]
      },
      {
        name: 'miner_red_run_1',
        width: 16,
        height: 16,
        pixels: [
          '................',
          '....099990......',
          '....099990LL....',
          '....0FFFF0LL....',
          '....0F0F00......',
          '....0FFFF0......',
          '...0RRRRRR0.....',
          '...0RrRrRr0.....',
          '...0RrRrRr0.....',
          '...0RrRrRr0.....',
          '...00RRRR00.....',
          '....070070......',
          '....070070......',
          '....00..00......',
          '................',
          '................'
        ]
      },
      {
        name: 'miner_red_run_2',
        width: 16,
        height: 16,
        pixels: [
          '................',
          '....099990......',
          '....099990LL....',
          '....0FFFF0LL....',
          '....0F0F00......',
          '....0FFFF0......',
          '...0RRRRRR0.....',
          '...0RrRrRr0.....',
          '...0RrRrRr0.....',
          '...0RrRrRr0.....',
          '...00RRRR00.....',
          '...070...070....',
          '....070.070.....',
          '....00...00.....',
          '................',
          '................'
        ]
      },
      {
        name: 'miner_red_run_3',
        width: 16,
        height: 16,
        pixels: [
          '................',
          '....099990......',
          '....099990LL....',
          '....0FFFF0LL....',
          '....0F0F00......',
          '....0FFFF0......',
          '...0RRRRRR0.....',
          '...0RrRrRr0.....',
          '...0RrRrRr0.....',
          '...0RrRrRr0.....',
          '...00RRRR00.....',
          '....070070......',
          '....070070......',
          '....00..00......',
          '................',
          '................'
        ]
      },

      // -----------------------------------------------------------------------
      // BLUE CREW MINER (Frames: Idle + 4-frame run)
      // -----------------------------------------------------------------------
      {
        name: 'miner_blue_idle',
        width: 16,
        height: 16,
        pixels: [
          '................',
          '....099990......',
          '....099990LL....',
          '....0FFFF0LL....',
          '....0F0F00......',
          '....0FFFF0......',
          '...0BBBBBB0.....',
          '...0BbBbBb0.....',
          '...0BbBbBb0.....',
          '...0BbBbBb0.....',
          '...00BBBB00.....',
          '....070070......',
          '....070070......',
          '....00..00......',
          '................',
          '................'
        ]
      },
      {
        name: 'miner_blue_run_0',
        width: 16,
        height: 16,
        pixels: [
          '................',
          '....099990......',
          '....099990LL....',
          '....0FFFF0LL....',
          '....0F0F00......',
          '....0FFFF0......',
          '...0BBBBBB0.....',
          '...0BbBbBb0.....',
          '...0BbBbBb0.....',
          '...0BbBbBb0.....',
          '...00BBBB00.....',
          '....070.070.....',
          '...070...070....',
          '...00.....00....',
          '................',
          '................'
        ]
      },
      {
        name: 'miner_blue_run_1',
        width: 16,
        height: 16,
        pixels: [
          '................',
          '....099990......',
          '....099990LL....',
          '....0FFFF0LL....',
          '....0F0F00......',
          '....0FFFF0......',
          '...0BBBBBB0.....',
          '...0BbBbBb0.....',
          '...0BbBbBb0.....',
          '...0BbBbBb0.....',
          '...00BBBB00.....',
          '....070070......',
          '....070070......',
          '....00..00......',
          '................',
          '................'
        ]
      },
      {
        name: 'miner_blue_run_2',
        width: 16,
        height: 16,
        pixels: [
          '................',
          '....099990......',
          '....099990LL....',
          '....0FFFF0LL....',
          '....0F0F00......',
          '....0FFFF0......',
          '...0BBBBBB0.....',
          '...0BbBbBb0.....',
          '...0BbBbBb0.....',
          '...0BbBbBb0.....',
          '...00BBBB00.....',
          '...070...070....',
          '....070.070.....',
          '....00...00.....',
          '................',
          '................'
        ]
      },
      {
        name: 'miner_blue_run_3',
        width: 16,
        height: 16,
        pixels: [
          '................',
          '....099990......',
          '....099990LL....',
          '....0FFFF0LL....',
          '....0F0F00......',
          '....0FFFF0......',
          '...0BBBBBB0.....',
          '...0BbBbBb0.....',
          '...0BbBbBb0.....',
          '...0BbBbBb0.....',
          '...00BBBB00.....',
          '....070070......',
          '....070070......',
          '....00..00......',
          '................',
          '................'
        ]
      },

      // -----------------------------------------------------------------------
      // TOOLS & WEAPONS
      // -----------------------------------------------------------------------
      {
        name: 'pickaxe_tool',
        width: 16,
        height: 16,
        pixels: [
          '.........ssss...',
          '........sSSSS...',
          '.......sSS......',
          '......070.......',
          '.....070........',
          '....070.........',
          '...070..........',
          '..070...........',
          '.070............',
          '00..............',
          '................',
          '................',
          '................',
          '................',
          '................',
          '................'
        ]
      },
      {
        name: 'flintlock_tool',
        width: 16,
        height: 16,
        pixels: [
          '................',
          '................',
          '................',
          '..0SSSSSS0......',
          '..0ssssss0......',
          '...077000.......',
          '...0770.........',
          '....070.........',
          '.....00.........',
          '................',
          '................',
          '................',
          '................',
          '................',
          '................',
          '................'
        ]
      },
      {
        name: 'bullet_lead',
        width: 8,
        height: 8,
        pixels: [
          '........',
          '..0SS0..',
          '.0SssS0.',
          '.0SssS0.',
          '..0SS0..',
          '........',
          '........',
          '........'
        ]
      },

      // -----------------------------------------------------------------------
      // EXTRACTION MINECARTS (32x24)
      // -----------------------------------------------------------------------
      {
        name: 'cart_red',
        width: 32,
        height: 24,
        pixels: [
          '................................',
          '..0000000000000000000000000000..',
          '..0RRRRRRRRRRRRRRRRRRRRRRRRRR0..',
          '..0RrRrRrRrRrRrRrRrRrRrRrRrRr0..',
          '..0RRRRRRRRRRRRRRRRRRRRRRRRRR0..',
          '..0666666666666666666666666660..',
          '..0777777777777777777777777770..',
          '..0888888888888888888888888880..',
          '..0777777777777777777777777770..',
          '..0666666666666666666666666660..',
          '..0000000000000000000000000000..',
          '...0111111111111111111111110...',
          '....03333333333333333333330....',
          '....02222222222222222222220....',
          '.....000000000000000000000.....',
          '.....011110.........011110.....',
          '....01222210.......01222210....',
          '....02333320.......02333320....',
          '....02300320.......02300320....',
          '....02300320.......02300320....',
          '....02333320.......02333320....',
          '....01222210.......01222210....',
          '.....011110.........011110.....',
          '......0000...........0000......'
        ]
      },
      {
        name: 'cart_blue',
        width: 32,
        height: 24,
        pixels: [
          '................................',
          '..0000000000000000000000000000..',
          '..0BBBBBBBBBBBBBBBBBBBBBBBBBB0..',
          '..0BbBbBbBbBbBbBbBbBbBbBbBbBb0..',
          '..0BBBBBBBBBBBBBBBBBBBBBBBBBB0..',
          '..0666666666666666666666666660..',
          '..0777777777777777777777777770..',
          '..0888888888888888888888888880..',
          '..0777777777777777777777777770..',
          '..0666666666666666666666666660..',
          '..0000000000000000000000000000..',
          '...0111111111111111111111110...',
          '....03333333333333333333330....',
          '....02222222222222222222220....',
          '.....000000000000000000000.....',
          '.....011110.........011110.....',
          '....01222210.......01222210....',
          '....02333320.......02333320....',
          '....02300320.......02300320....',
          '....02300320.......02300320....',
          '....02333320.......02333320....',
          '....01222210.......01222210....',
          '.....011110.........011110.....',
          '......0000...........0000......'
        ]
      },

      // -----------------------------------------------------------------------
      // WALL SCONCE / TORCH (16x16)
      // -----------------------------------------------------------------------
      {
        name: 'torch_sconce',
        width: 16,
        height: 16,
        pixels: [
          '.......LL.......',
          '......LXXL......',
          '.....LGXXGL.....',
          '......LXXL......',
          '.......LL.......',
          '......0660......',
          '......0660......',
          '.....011110.....',
          '.....012210.....',
          '.....012210.....',
          '......0110......',
          '.......00.......',
          '................',
          '................',
          '................',
          '................'
        ]
      }
    ];
  }
}
