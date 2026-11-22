// TESTDATEN: invented restaurants, dishes, prices and values so every screen has enough to show
// across Mitte, Kreuzberg, Prenzlauer Berg, Friedrichshain and Neukölln.
// None of these places exist; the UI marks every one of them with the Testdaten badge.
import type { Confidence, Kiez, NutritionSource } from '../contract'

/** name, description, category, price EUR, protein g, carbs g, fat g, confidence, diet */
export type TestDish = [
  string,
  string,
  string,
  number,
  number,
  number,
  number,
  Confidence,
  Array<'vegan' | 'vegetarian'>,
]

export interface TestRestaurant {
  id: string
  name: string
  kiez: Kiez
  address: string
  lat: number
  lng: number
  cuisine: string[]
  hours: string
  /** Invented values are never shown as a restaurant's own published nutrition, so test data is always an estimate. */
  source: Extract<NutritionSource, 'ai'>
  dishes: TestDish[]
}

const V: Array<'vegan'> = ['vegan']
const VG: Array<'vegetarian'> = ['vegetarian']
const M: [] = []

export const TEST_RESTAURANTS: TestRestaurant[] = [
  // ---------- Mitte ----------
  {
    id: 'test-gruenkern-kantine',
    name: 'Grünkern Kantine',
    kiez: 'Mitte',
    address: 'Torstraße 140, 10119 Berlin',
    lat: 52.5293,
    lng: 13.401,
    cuisine: ['Bowls', 'Deutsch'],
    hours: 'Mo-Fr 11:00-21:00; Sa 12:00-20:00',
    source: 'ai',
    dishes: [
      ['Hähnchen-Linsen-Bowl', 'Gegrillte Hähnchenbrust, Belugalinsen, Ofengemüse, Joghurt-Kräuter-Dip', 'Bowls', 11.9, 48, 62, 16, 'medium', M],
      ['Lachs mit Grünkern-Risotto', 'Ofenlachs auf Grünkern-Risotto mit Blattspinat', 'Hauptgerichte', 15.5, 38, 58, 26, 'medium', M],
      ['Tofu-Grünkohl-Bowl', 'Räuchertofu, Grünkohl, Süßkartoffel, Tahini', 'Bowls', 10.5, 26, 64, 22, 'medium', V],
      ['Linsensuppe', 'Rote Linsen, Möhre, Kreuzkümmel, Brot', 'Suppen', 6.5, 18, 52, 9, 'high', V],
    ],
  },
  {
    id: 'test-linse-und-loeffel',
    name: 'Linse & Löffel',
    kiez: 'Mitte',
    address: 'Invalidenstraße 112, 10115 Berlin',
    lat: 52.5305,
    lng: 13.383,
    cuisine: ['Vegetarisch', 'Suppen'],
    hours: 'Mo-Fr 11:30-16:00',
    source: 'ai',
    dishes: [
      ['Dal mit Basmatireis', 'Gelbe Linsen, Kokos, Spinat, Reis', 'Eintöpfe', 8.9, 21, 88, 14, 'medium', V],
      ['Kichererbsen-Curry', 'Kichererbsen, Tomate, Paneer, Naan', 'Eintöpfe', 9.9, 27, 82, 24, 'medium', VG],
      ['Quinoa-Feta-Salat', 'Quinoa, Feta, Gurke, Minze, Zitronendressing', 'Salate', 9.5, 19, 46, 21, 'medium', VG],
      ['Bohnen-Chili', 'Kidneybohnen, Mais, Paprika, Sauerrahm', 'Eintöpfe', 8.5, 23, 70, 13, 'high', VG],
    ],
  },
  {
    id: 'test-sesam-mitte',
    name: 'Sesam Mitte',
    kiez: 'Mitte',
    address: 'Oranienburger Straße 32, 10117 Berlin',
    lat: 52.5249,
    lng: 13.3935,
    cuisine: ['Koreanisch'],
    hours: 'Mo-Sa 12:00-22:30',
    source: 'ai',
    dishes: [
      ['Bibimbap mit Rind', 'Reis, mariniertes Rindfleisch, Gemüse, Spiegelei, Gochujang', 'Reisgerichte', 13.9, 36, 86, 22, 'medium', M],
      ['Bibimbap mit Tofu', 'Reis, Tofu, Gemüse, Gochujang', 'Reisgerichte', 12.5, 22, 84, 16, 'medium', V],
      ['Dakgalbi', 'Scharf geschmortes Hähnchen mit Kohl und Reiskuchen', 'Hauptgerichte', 14.5, 42, 68, 18, 'low', M],
      ['Kimchi-Jjigae', 'Kimchi-Eintopf mit Schweinebauch und Tofu, Reis', 'Suppen', 12.9, 28, 62, 30, 'low', M],
    ],
  },
  // ---------- Kreuzberg ----------
  {
    id: 'test-bergmann-bowls',
    name: 'Bergmann Bowls',
    kiez: 'Kreuzberg',
    address: 'Bergmannstraße 14, 10961 Berlin',
    lat: 52.4898,
    lng: 13.3925,
    cuisine: ['Bowls', 'Poke'],
    hours: 'Mo-Su 11:00-22:00',
    source: 'ai',
    dishes: [
      ['Teriyaki-Hähnchen-Bowl', 'Sushireis, Hähnchen, Edamame, Gurke, Teriyaki', 'Bowls', 11.5, 41, 78, 14, 'medium', M],
      ['Lachs-Poke', 'Sushireis, roher Lachs, Avocado, Mango, Sesam', 'Poke', 13.9, 32, 74, 28, 'medium', M],
      ['Tofu-Poke', 'Reis, marinierter Tofu, Rotkohl, Edamame, Erdnuss', 'Poke', 10.9, 24, 72, 20, 'medium', V],
      ['Thunfisch-Protein-Bowl', 'Quinoa, Thunfisch, Ei, Brokkoli, Limette', 'Bowls', 12.5, 46, 44, 15, 'high', M],
      ['Edamame', 'Gedämpft, Meersalz', 'Kleinigkeiten', 4.5, 11, 9, 5, 'high', V],
    ],
  },
  {
    id: 'test-kotti-kebab-lab',
    name: 'Kotti Kebab Lab',
    kiez: 'Kreuzberg',
    address: 'Adalbertstraße 96, 10999 Berlin',
    lat: 52.4993,
    lng: 13.4185,
    cuisine: ['Türkisch', 'Grill'],
    hours: 'Mo-Su 10:00-02:00',
    source: 'ai',
    dishes: [
      ['Hähnchen-Döner-Teller', 'Hähnchen vom Spieß, Bulgur, Salat, Joghurt', 'Teller', 10.5, 48, 70, 24, 'medium', M],
      ['Adana-Spieß mit Salat', 'Lamm-Rind-Spieß, Hirtensalat, Fladenbrot', 'Grill', 12.9, 40, 46, 38, 'low', M],
      ['Hähnchen-Dürüm', 'Hähnchen, Salat, Tomate, Kräutersoße im Yufka', 'Wraps', 7.5, 36, 64, 22, 'medium', M],
      ['Linsenköfte-Teller', 'Rote Linsen, Bulgur, Salat, Granatapfel', 'Teller', 8.9, 17, 76, 10, 'medium', V],
    ],
  },
  {
    id: 'test-wiener-poke',
    name: 'Wiener Poke',
    kiez: 'Kreuzberg',
    address: 'Wiener Straße 20, 10999 Berlin',
    lat: 52.4985,
    lng: 13.433,
    cuisine: ['Hawaiianisch', 'Poke'],
    hours: 'Mo-Sa 12:00-21:00',
    source: 'ai',
    dishes: [
      ['Ahi-Poke', 'Thunfisch, Reis, Gurke, Wakame, Ponzu', 'Poke', 13.5, 38, 70, 12, 'medium', M],
      ['Garnelen-Poke', 'Garnelen, Reis, Mango, Avocado, Sriracha-Mayo', 'Poke', 13.9, 28, 72, 26, 'low', M],
      ['Hähnchen-Poke', 'Hähnchen, Quinoa, Mais, Rotkohl, Sesam', 'Poke', 11.9, 40, 60, 16, 'medium', M],
    ],
  },
  // ---------- Prenzlauer Berg ----------
  {
    id: 'test-kastanie-kitchen',
    name: 'Kastanie Kitchen',
    kiez: 'Prenzlauer Berg',
    address: 'Kastanienallee 30, 10435 Berlin',
    lat: 52.5385,
    lng: 13.4085,
    cuisine: ['Brunch', 'Bowls'],
    hours: 'Mo-Su 09:00-17:00',
    source: 'ai',
    dishes: [
      ['Shakshuka mit Feta', 'Eier in Tomaten-Paprika-Soße, Feta, Brot', 'Frühstück', 12.5, 26, 42, 28, 'medium', VG],
      ['Skyr-Bowl', 'Skyr, Beeren, Granola, Honig', 'Frühstück', 8.9, 28, 58, 10, 'high', VG],
      ['Hähnchen-Avocado-Sandwich', 'Sauerteigbrot, Hähnchen, Avocado, Rucola', 'Sandwiches', 11.5, 38, 52, 24, 'medium', M],
      ['Rührei mit Lachs', 'Drei Eier, Räucherlachs, Vollkornbrot', 'Frühstück', 13.9, 36, 32, 30, 'medium', M],
    ],
  },
  {
    id: 'test-kollwitz-greens',
    name: 'Kollwitz Greens',
    kiez: 'Prenzlauer Berg',
    address: 'Kollwitzstraße 50, 10405 Berlin',
    lat: 52.5355,
    lng: 13.4175,
    cuisine: ['Salate', 'Vegan'],
    hours: 'Mo-Fr 11:00-20:00; Sa 12:00-18:00',
    source: 'ai',
    dishes: [
      ['Tempeh-Caesar', 'Romana, Tempeh, Kapern, Cashew-Dressing, Croutons', 'Salate', 11.9, 30, 34, 26, 'medium', V],
      ['Seitan-Gyros-Bowl', 'Seitan, Bulgur, Tzatziki-Alternative, Tomate', 'Bowls', 12.5, 44, 58, 16, 'medium', V],
      ['Grünkohl-Salat', 'Grünkohl, Kürbis, Kerne, Ahorn-Senf', 'Salate', 10.5, 14, 38, 22, 'low', V],
    ],
  },
  {
    id: 'test-helmholtz-pho',
    name: 'Helmholtz Pho',
    kiez: 'Prenzlauer Berg',
    address: 'Lychener Straße 30, 10437 Berlin',
    lat: 52.543,
    lng: 13.419,
    cuisine: ['Vietnamesisch'],
    hours: 'Mo-Su 12:00-22:00',
    source: 'ai',
    dishes: [
      ['Pho Bo', 'Rinderbrühe, Reisnudeln, Rindfleisch, Kräuter', 'Suppen', 12.5, 34, 64, 10, 'medium', M],
      ['Pho Ga', 'Hühnerbrühe, Reisnudeln, Hähnchen, Kräuter', 'Suppen', 11.5, 32, 62, 8, 'medium', M],
      ['Bun Cha', 'Gegrilltes Schweinefleisch, Reisnudeln, Salat, Fischsoße', 'Nudeln', 13.5, 30, 72, 22, 'low', M],
      ['Sommerrollen mit Tofu', 'Reispapier, Tofu, Salat, Erdnusssoße', 'Vorspeisen', 6.9, 12, 34, 10, 'medium', V],
    ],
  },
  // ---------- Friedrichshain ----------
  {
    id: 'test-boxi-bowls',
    name: 'Boxi Bowls',
    kiez: 'Friedrichshain',
    address: 'Boxhagener Straße 70, 10245 Berlin',
    lat: 52.5105,
    lng: 13.465,
    cuisine: ['Bowls'],
    hours: 'Mo-Su 11:00-22:00',
    source: 'ai',
    dishes: [
      ['Burrito-Bowl mit Hähnchen', 'Reis, schwarze Bohnen, Hähnchen, Mais, Salsa', 'Bowls', 10.9, 44, 82, 16, 'medium', M],
      ['Burrito-Bowl mit Bohnen', 'Reis, schwarze Bohnen, Guacamole, Salsa', 'Bowls', 9.5, 20, 92, 18, 'medium', V],
      ['Steak-Bowl', 'Rinderhüfte, Süßkartoffel, Brokkoli, Chimichurri', 'Bowls', 14.9, 42, 48, 24, 'medium', M],
    ],
  },
  {
    id: 'test-simon-dach-grill',
    name: 'Simon-Dach Grill',
    kiez: 'Friedrichshain',
    address: 'Simon-Dach-Straße 20, 10245 Berlin',
    lat: 52.51,
    lng: 13.457,
    cuisine: ['Grill', 'Burger'],
    hours: 'Mo-Th,Su 12:00-23:00; Fr-Sa 12:00-01:00',
    source: 'ai',
    dishes: [
      ['Hähnchenbrust vom Grill', 'Mit Ofenkartoffel und gemischtem Salat', 'Grill', 14.5, 52, 46, 14, 'medium', M],
      ['Classic Burger', 'Rind, Cheddar, Brioche, Pommes', 'Burger', 13.9, 38, 96, 52, 'low', M],
      ['Halloumi-Wrap', 'Halloumi, Paprika, Hummus, Salat', 'Wraps', 10.5, 26, 58, 30, 'medium', VG],
      ['Lachsfilet mit Gemüse', 'Gegrillter Lachs, Grillgemüse, Kräuterquark', 'Grill', 16.9, 40, 18, 30, 'medium', M],
    ],
  },
  {
    id: 'test-frankfurter-tor-falafel',
    name: 'Falafel am Tor',
    kiez: 'Friedrichshain',
    address: 'Frankfurter Allee 30, 10247 Berlin',
    lat: 52.515,
    lng: 13.456,
    cuisine: ['Falafel', 'Levantinisch'],
    hours: 'Mo-Su 11:00-23:00',
    source: 'ai',
    dishes: [
      ['Falafel-Teller', 'Sechs Falafel, Hummus, Salat, Fladenbrot', 'Teller', 9.5, 24, 92, 34, 'medium', V],
      ['Hähnchen-Schawarma-Teller', 'Hähnchen, Reis, Salat, Knoblauchcreme', 'Teller', 11.5, 46, 74, 22, 'medium', M],
      ['Falafel-Wrap', 'Falafel, Hummus, Gemüse, Tahin', 'Wraps', 5.5, 16, 62, 22, 'high', V],
      ['Hummus mit Kichererbsen', 'Hummus, Kichererbsen, Ei, Brot', 'Teller', 8.5, 22, 60, 26, 'medium', VG],
    ],
  },
  // ---------- Neukölln ----------
  {
    id: 'test-weserkueche',
    name: 'Weserküche',
    kiez: 'Neukölln',
    address: 'Weserstraße 50, 12045 Berlin',
    lat: 52.487,
    lng: 13.432,
    cuisine: ['Modern deutsch'],
    hours: 'Tu-Su 12:00-22:00; Mo off',
    source: 'ai',
    dishes: [
      ['Maultaschen mit Linsen', 'Hausgemachte Maultaschen, Alblinsen, Röstzwiebeln', 'Hauptgerichte', 13.5, 28, 78, 24, 'low', M],
      ['Kabeljau mit Kartoffelstampf', 'Kabeljau, Senfsoße, Stampf, Gurkensalat', 'Hauptgerichte', 16.5, 38, 52, 20, 'medium', M],
      ['Rote-Bete-Bowl', 'Rote Bete, Hirse, Ziegenkäse, Walnuss', 'Bowls', 11.5, 20, 58, 26, 'medium', VG],
    ],
  },
  {
    id: 'test-sonnenallee-mezze',
    name: 'Sonnenallee Mezze',
    kiez: 'Neukölln',
    address: 'Sonnenallee 60, 12045 Berlin',
    lat: 52.4835,
    lng: 13.4405,
    cuisine: ['Arabisch', 'Grill'],
    hours: 'Mo-Su 11:00-24:00',
    source: 'ai',
    dishes: [
      ['Shish Tawook', 'Hähnchenspieße, Reis, Knoblauchcreme, Salat', 'Grill', 12.5, 50, 68, 20, 'medium', M],
      ['Fattoush mit Hähnchen', 'Brotsalat, Hähnchen, Sumach, Granatapfel', 'Salate', 10.5, 36, 42, 18, 'medium', M],
      ['Foul Medames', 'Saubohnen, Olivenöl, Zitrone, Brot', 'Frühstück', 6.5, 18, 58, 16, 'medium', V],
      ['Mezze-Platte', 'Hummus, Mutabal, Falafel, Tabouleh, Brot', 'Teller', 14.5, 26, 110, 48, 'low', V],
    ],
  },
  {
    id: 'test-schillerkiez-protein',
    name: 'Schillerkiez Protein Bar',
    kiez: 'Neukölln',
    address: 'Herrfurthstraße 10, 12049 Berlin',
    lat: 52.479,
    lng: 13.4235,
    cuisine: ['Fitness', 'Bowls'],
    hours: 'Mo-Fr 08:00-20:00; Sa,Su 10:00-18:00',
    source: 'ai',
    dishes: [
      ['High-Protein-Bowl Hähnchen', 'Hähnchen, Reis, Brokkoli, Ei, Erdnusssoße', 'Bowls', 11.9, 55, 62, 18, 'high', M],
      ['Pute mit Süßkartoffel', 'Putenbrust, Süßkartoffel, grüne Bohnen', 'Bowls', 12.5, 50, 54, 10, 'high', M],
      ['Overnight Oats Protein', 'Haferflocken, Skyr, Whey, Beeren', 'Frühstück', 6.9, 34, 56, 9, 'high', VG],
      ['Tofu-Edamame-Bowl', 'Tofu, Edamame, Quinoa, Spinat, Miso', 'Bowls', 10.9, 38, 48, 18, 'high', V],
    ],
  },
]
