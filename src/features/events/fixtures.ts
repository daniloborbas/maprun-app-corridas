import type { RaceEvent, Category } from './types';
// Synthetic fixtures never load implicitly in production or into a real database.
const rows: [string, string, string, string, Category, number, number, number[]][] = [
  [
    'Meia Maratona da Mantiqueira',
    'Itajubá',
    'MG',
    '2026-10-18',
    'rua',
    -22.425,
    -45.452,
    [5, 10, 21],
  ],
  [
    'Caminhos da Serra',
    'Campos do Jordão',
    'SP',
    '2026-10-25',
    'trail',
    -22.739,
    -45.592,
    [10, 21],
  ],
  ['Corre, Belo Horizonte', 'Belo Horizonte', 'MG', '2026-11-01', 'rua', -19.919, -43.938, [5, 10]],
  ['Night Run São Paulo', 'São Paulo', 'SP', '2026-11-07', 'night', -23.551, -46.633, [5, 10]],
  ['Maratona à Beira-Mar', 'Rio de Janeiro', 'RJ', '2026-11-15', 'rua', -22.907, -43.173, [21, 42]],
  ['Pequenos Corredores', 'Itajubá', 'MG', '2026-11-22', 'kids', -22.426, -45.459, [0.5, 1]],
  ['Desafio das Águas', 'São Lourenço', 'MG', '2026-11-29', 'rua', -22.116, -45.054, [5, 10]],
  ['Trilhas do Sul', 'Pouso Alegre', 'MG', '2026-12-06', 'trail', -22.23, -45.936, [10, 21]],
  ['Corrida do Verão', 'Santos', 'SP', '2026-12-13', 'rua', -23.961, -46.333, [5, 10]],
  [
    'Volta da Pampulha • exemplo',
    'Belo Horizonte',
    'MG',
    '2026-12-20',
    'rua',
    -19.85,
    -43.97,
    [18],
  ],
  ['Circuito das Montanhas', 'Gonçalves', 'MG', '2026-09-06', 'trail', -22.658, -45.855, [10, 21]],
  ['Corrida do Parque', 'Campinas', 'SP', '2026-12-27', 'rua', -22.909, -47.062, [5]],
];
export const demoEvents: RaceEvent[] = rows.map(
  ([name, city, state, date, category, lat, lng, distances], i) => ({
    id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
    slug: `demonstracao-${i + 1}`,
    name,
    city,
    state,
    country: 'BR',
    start_date: `${date}T07:00:00-03:00`,
    end_date: `${date}T13:00:00-03:00`,
    short_description: 'Uma nova linha de chegada. Um novo lugar para conhecer.',
    description:
      'Evento fictício para explorar o MapRun. Descubra novos percursos, salve suas próximas experiências e encontre a distância que combina com você. As informações, valores e datas desta demonstração não correspondem a uma prova confirmada.',
    venue: 'Parque Municipal',
    address: 'Local ilustrativo — endereço a confirmar',
    latitude: lat,
    longitude: lng,
    organizer_name: 'Organização demonstrativa',
    event_category: category,
    official_url: '',
    registration_url: '',
    regulation_url: '',
    price_from: i === 5 ? 0 : 79 + i * 10,
    cover_image_url:
      category === 'trail' || i === 0
        ? '/images/mantiqueira-run.png'
        : category === 'night'
          ? '/images/road.jpg'
          : '/images/runners.jpg',
    cover_image_source: 'fallback',
    has_usable_official_image: false,
    short_tagline:
      i === 0 ? 'Seu próximo desafio tem um novo cenário.' : 'Mais corridas. Mais histórias.',
    status: i === 10 ? 'finished' : i === 11 ? 'cancelled' : 'published',
    organizer_verified: false,
    event_distances: distances.map((distance_km) => ({
      label: `${distance_km} km`,
      distance_km,
      category,
    })),
    sponsored: i === 2,
    demo: true,
  }),
);
