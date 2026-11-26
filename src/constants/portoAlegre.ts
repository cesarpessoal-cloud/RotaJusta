import { DeliveryStop, Order, Profile } from '../types';
import { calculatePricing } from '../utils/pricing';

export const POA_CENTER: { lat: number; lng: number } = {
  lat: -30.0346,
  lng: -51.2177,
};

export const POA_NEIGHBORHOOD_COORDS: Record<string, { lat: number; lng: number }> = {
  'Centro Histórico': { lat: -30.0277, lng: -51.2287 },
  'Cidade Baixa': { lat: -30.0414, lng: -51.2216 },
  'Menino Deus': { lat: -30.0517, lng: -51.2225 },
  'Moinhos de Vento': { lat: -30.0258, lng: -51.2022 },
  'Bom Fim': { lat: -30.0347, lng: -51.2111 },
  'Santana': { lat: -30.0442, lng: -51.2045 },
  'Petrópolis': { lat: -30.0361, lng: -51.1825 },
  'Praia de Belas': { lat: -30.0533, lng: -51.2303 },
  'Azenha': { lat: -30.0472, lng: -51.2119 },
  'Partenon': { lat: -30.0589, lng: -51.1678 },
  'Floresta': { lat: -30.0218, lng: -51.2141 },
  'Rio Branco': { lat: -30.0325, lng: -51.1965 },
  'Bela Vista': { lat: -30.0314, lng: -51.1869 },
  'Auxiliadora': { lat: -30.0199, lng: -51.1932 },
  'Independência': { lat: -30.0298, lng: -51.2155 },
  "Passo d'Areia": { lat: -30.0124, lng: -51.1665 },
  'Navegantes': { lat: -29.9985, lng: -51.2015 },
  'Tristeza': { lat: -30.1112, lng: -51.2536 },
  'Cristal': { lat: -30.0885, lng: -51.2462 },
};

export const POA_NEIGHBORHOODS: string[] = Object.keys(POA_NEIGHBORHOOD_COORDS);

const STREET_TO_NEIGHBORHOOD_HINTS: Array<{ keyword: string; neighborhood: string }> = [
  { keyword: 'andradas', neighborhood: 'Centro Histórico' },
  { keyword: 'borges de medeiros', neighborhood: 'Centro Histórico' },
  { keyword: 'salgado filho', neighborhood: 'Centro Histórico' },
  { keyword: 'rua da praia', neighborhood: 'Centro Histórico' },
  { keyword: 'joão alfredo', neighborhood: 'Cidade Baixa' },
  { keyword: 'joao alfredo', neighborhood: 'Cidade Baixa' },
  { keyword: 'lima e silva', neighborhood: 'Cidade Baixa' },
  { keyword: 'república', neighborhood: 'Cidade Baixa' },
  { keyword: 'republica', neighborhood: 'Cidade Baixa' },
  { keyword: 'josé do patrocínio', neighborhood: 'Cidade Baixa' },
  { keyword: 'jose do patrocinio', neighborhood: 'Cidade Baixa' },
  { keyword: 'venâncio aires', neighborhood: 'Cidade Baixa' },
  { keyword: 'getúlio vargas', neighborhood: 'Menino Deus' },
  { keyword: 'getulio vargas', neighborhood: 'Menino Deus' },
  { keyword: 'josé de alencar', neighborhood: 'Menino Deus' },
  { keyword: 'gonçalves dias', neighborhood: 'Menino Deus' },
  { keyword: 'padre chagas', neighborhood: 'Moinhos de Vento' },
  { keyword: 'félix da cunha', neighborhood: 'Moinhos de Vento' },
  { keyword: '24 de outubro', neighborhood: 'Moinhos de Vento' },
  { keyword: 'dinarte ribeiro', neighborhood: 'Moinhos de Vento' },
  { keyword: 'osvaldo aranha', neighborhood: 'Bom Fim' },
  { keyword: 'fernandes vieira', neighborhood: 'Bom Fim' },
  { keyword: 'vasco da gama', neighborhood: 'Bom Fim' },
  { keyword: 'felipe camarão', neighborhood: 'Bom Fim' },
  { keyword: 'protásio alves', neighborhood: 'Petrópolis' },
  { keyword: 'protasio alves', neighborhood: 'Petrópolis' },
  { keyword: 'carazinho', neighborhood: 'Petrópolis' },
  { keyword: 'vicente da fontoura', neighborhood: 'Santana' },
  { keyword: 'princesa isabel', neighborhood: 'Santana' },
  { keyword: 'bento gonçalves', neighborhood: 'Partenon' },
  { keyword: 'praia de belas', neighborhood: 'Praia de Belas' },
  { keyword: 'padre cacique', neighborhood: 'Praia de Belas' },
  { keyword: 'érico veríssimo', neighborhood: 'Azenha' },
  { keyword: 'erico verissimo', neighborhood: 'Azenha' },
  { keyword: 'azambuja', neighborhood: 'Partenon' },
];

function hashString(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

/**
 * Resolves approximate real coordinates in Porto Alegre (RS) based on neighborhood
 * and street text hints, adding a small deterministic street offset so multiple stops
 * in the same neighborhood never overlap on the exact same pin.
 */
export function resolvePortoAlegreCoordinates(
  address: string,
  fallbackNeighborhood: string,
  sequenceIndex = 0
): { lat: number; lng: number; matchedNeighborhood: string } {
  const normalizedAddress = (address || '').toLowerCase();

  let matchedNeighborhood = fallbackNeighborhood;
  for (const nb of POA_NEIGHBORHOODS) {
    if (normalizedAddress.includes(nb.toLowerCase())) {
      matchedNeighborhood = nb;
      break;
    }
  }

  if (matchedNeighborhood === fallbackNeighborhood) {
    for (const hint of STREET_TO_NEIGHBORHOOD_HINTS) {
      if (normalizedAddress.includes(hint.keyword)) {
        matchedNeighborhood = hint.neighborhood;
        break;
      }
    }
  }

  const base = POA_NEIGHBORHOOD_COORDS[matchedNeighborhood] ?? POA_CENTER;
  const seed = hashString(`${address}-${matchedNeighborhood}-${sequenceIndex}`);
  const angle = ((seed % 360) * Math.PI) / 180;
  // Radius between ~80m and ~320m around neighborhood centroid
  const radius = 0.0008 + ((seed % 24) / 24) * 0.0022;

  return {
    lat: Number((base.lat + Math.sin(angle) * radius).toFixed(6)),
    lng: Number((base.lng + Math.cos(angle) * radius).toFixed(6)),
    matchedNeighborhood,
  };
}

export function buildGoogleMapsStopUrl(stop: {
  address: string;
  neighborhood: string;
  lat?: number;
  lng?: number;
}): string {
  const hasCoords =
    stop.lat !== undefined &&
    stop.lng !== undefined &&
    !Number.isNaN(stop.lat) &&
    !Number.isNaN(stop.lng);
  const destination = stop.address.trim()
    ? `${stop.address.trim()}, ${stop.neighborhood}, Porto Alegre - RS, Brasil`
    : hasCoords
    ? `${stop.lat},${stop.lng}`
    : `${stop.neighborhood}, Porto Alegre - RS, Brasil`;

  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
    destination
  )}&travelmode=driving`;
}

export function buildWazeStopUrl(stop: {
  address: string;
  neighborhood: string;
  lat?: number;
  lng?: number;
}): string {
  const hasCoords =
    stop.lat !== undefined &&
    stop.lng !== undefined &&
    !Number.isNaN(stop.lat) &&
    !Number.isNaN(stop.lng);

  if (hasCoords) {
    return `https://waze.com/ul?ll=${stop.lat},${stop.lng}&navigate=yes`;
  }

  const query = stop.address.trim()
    ? `${stop.address.trim()}, ${stop.neighborhood}, Porto Alegre, RS`
    : `${stop.neighborhood}, Porto Alegre, RS`;

  return `https://waze.com/ul?q=${encodeURIComponent(query)}&navigate=yes`;
}

export const POA_STREETS_BY_NEIGHBORHOOD: Record<string, string[]> = {
  'Centro Histórico': [
    'Rua dos Andradas, 1180',
    'Av. Borges de Medeiros, 540',
    'Rua da Praia, 890',
    'Av. Salgado Filho, 215',
  ],
  'Menino Deus': [
    'Av. Getúlio Vargas, 890',
    'Rua José de Alencar, 412',
    'Rua Gonçalves Dias, 655',
    'Av. Praia de Belas, 1320',
  ],
  'Cidade Baixa': [
    'Rua João Alfredo, 418',
    'Rua General Lima e Silva, 742',
    'Rua da República, 315',
    'Rua José do Patrocínio, 608',
    'Av. Venâncio Aires, 195',
    'Rua Sofia Veloso, 112',
    'Rua Joaquim Nabuco, 280',
    'Rua Lopo Gonçalves, 490',
    'Rua Sebastião Leão, 150',
    'Rua Sarmento Leite, 830',
  ],
  'Moinhos de Vento': [
    'Rua Padre Chagas, 210',
    'Rua Félix da Cunha, 780',
    'Rua Dinarte Ribeiro, 145',
    'Av. 24 de Outubro, 1120',
  ],
  'Bom Fim': [
    'Av. Osvaldo Aranha, 1040',
    'Rua Fernandes Vieira, 390',
    'Rua Vasco da Gama, 515',
    'Rua Felipe Camarão, 244',
  ],
  'Floresta': [
    'Av. Farrapos, 1450',
    'Rua Hoffmann, 380',
    'Av. Cristóvão Colombo, 920',
    'Rua Voluntários da Pátria, 1780',
  ],
  'Praia de Belas': [
    'Av. Praia de Belas, 1181',
    'Av. Padre Cacique, 891',
    'Rua Silveiro, 220',
  ],
  'Petrópolis': [
    'Av. Protásio Alves, 2410',
    'Rua Carazinho, 510',
    'Av. Ipiranga, 3900',
  ],
  'Santana': [
    'Av. Bento Gonçalves, 940',
    'Rua Vicente da Fontoura, 1520',
    'Av. Princesa Isabel, 730',
  ],
  'Azenha': [
    'Av. da Azenha, 1120',
    'Av. Érico Veríssimo, 640',
    'Rua Prof. Freitas e Castro, 310',
  ],
  'Partenon': [
    'Av. Bento Gonçalves, 2850',
    'Rua Frei Germano, 415',
    'Av. Coronel Aparício Borges, 1290',
  ],
  'Rio Branco': [
    'Av. Mariante, 445',
    'Rua Cabral, 620',
    'Av. Protásio Alves, 1180',
  ],
  'Bela Vista': [
    'Av. Nilo Peçanha, 1650',
    'Rua Carlos Trein Filho, 410',
    'Praça da Encol, 85',
  ],
};

export interface SampleStopDraft {
  address: string;
  neighborhood: string;
  expectedRecipient: string;
  recipientNote: string;
}

export const SAMPLE_POA_CONSOLIDATED_STOPS: SampleStopDraft[] = [
  {
    address: 'Rua João Alfredo, 418',
    neighborhood: 'Cidade Baixa',
    expectedRecipient: 'Carla Menezes',
    recipientNote: 'Apto 204 · Interfone 24',
  },
  {
    address: 'Rua General Lima e Silva, 742',
    neighborhood: 'Cidade Baixa',
    expectedRecipient: 'Café República',
    recipientNote: 'Entregar no balcão',
  },
  {
    address: 'Av. Getúlio Vargas, 620',
    neighborhood: 'Menino Deus',
    expectedRecipient: 'Marcos Oliveira',
    recipientNote: 'Portaria 24h · Bloco B',
  },
  {
    address: 'Rua Vicente da Fontoura, 1520',
    neighborhood: 'Santana',
    expectedRecipient: 'Fernanda Costa',
    recipientNote: 'Casa de portão verde',
  },
];

export function generateStopsForNeighborhood(
  neighborhood: string,
  count: number,
  customSingleAddress?: string
): DeliveryStop[] {
  const safeCount = Math.max(1, count);
  if (safeCount === 1 && customSingleAddress) {
    const coords = resolvePortoAlegreCoordinates(
      customSingleAddress,
      neighborhood,
      1
    );
    return [
      {
        id: `stop-${Date.now()}-1`,
        sequence: 1,
        address: customSingleAddress,
        neighborhood,
        lat: coords.lat,
        lng: coords.lng,
        delivered: false,
      },
    ];
  }

  const knownStreets = POA_STREETS_BY_NEIGHBORHOOD[neighborhood] ?? [
    `Av. Principal de ${neighborhood}, 120`,
    `Rua das Palmeiras, 240 — ${neighborhood}`,
    `Rua dos Pinheiros, 385 — ${neighborhood}`,
    `Av. Central, 510 — ${neighborhood}`,
    `Rua Porto Alegre, 670 — ${neighborhood}`,
  ];

  return Array.from({ length: safeCount }, (_, idx) => {
    const template = knownStreets[idx % knownStreets.length];
    const suffix =
      idx >= knownStreets.length
        ? ` (Bloco ${Math.floor(idx / knownStreets.length) + 1})`
        : '';
    const fullAddress = `${template}${suffix}`;
    const coords = resolvePortoAlegreCoordinates(fullAddress, neighborhood, idx + 1);
    return {
      id: `stop-${Date.now()}-${idx + 1}`,
      sequence: idx + 1,
      address: fullAddress,
      neighborhood,
      lat: coords.lat,
      lng: coords.lng,
      delivered: false,
    };
  });
}

export const INITIAL_PROFILES: Profile[] = [
  {
    id: 'prof-lojista-1',
    role: 'lojista',
    name: 'Henrique Almeida',
    businessName: 'Café & Livraria do Centro',
    document: '28.419.502/0001-14',
    phone: '(51) 99124-3310',
    neighborhood: 'Centro Histórico',
    address: 'Rua dos Andradas, 1234',
    approvalStatus: 'Aprovado',
    createdAt: '2026-11-24T09:10:00.000Z',
  },
  {
    id: 'prof-lojista-2',
    role: 'lojista',
    name: 'Beatriz Dornelles',
    businessName: 'Empório Moinhos',
    document: '34.902.118/0001-82',
    phone: '(51) 99812-7740',
    neighborhood: 'Moinhos de Vento',
    address: 'Rua Padre Chagas, 210',
    approvalStatus: 'Aprovado',
    createdAt: '2026-11-24T10:15:00.000Z',
  },
  {
    id: 'prof-entregador-ev',
    role: 'entregador',
    name: 'Lucas Ferreira',
    document: '018.442.910-32',
    phone: '(51) 99455-8821',
    neighborhood: 'Bom Fim',
    vehicleType: 'Moto',
    propulsion: 'Elétrico',
    vehicleModel: 'Voltz EVS Elétrica',
    plate: 'POA-4E21',
    cnhNumber: '06492817304',
    hasEar: true,
    approvalStatus: 'Aprovado',
    createdAt: '2026-11-23T14:00:00.000Z',
  },
  {
    id: 'prof-entregador-comb',
    role: 'entregador',
    name: 'Mariana Souza',
    document: '029.731.500-98',
    phone: '(51) 99311-2049',
    neighborhood: 'Menino Deus',
    vehicleType: 'Moto',
    propulsion: 'Combustão',
    vehicleModel: 'Honda CG 160 Start',
    plate: 'IXX-9H42',
    cnhNumber: '05839102488',
    hasEar: true,
    approvalStatus: 'Aprovado',
    createdAt: '2026-11-23T16:30:00.000Z',
  },
  {
    id: 'prof-entregador-bike',
    role: 'entregador',
    name: 'Ana Paula Costa',
    document: '052.184.770-11',
    phone: '(51) 99210-4488',
    neighborhood: 'Cidade Baixa',
    vehicleType: 'Bike',
    propulsion: 'Elétrica / Pedal Assistido (E-Bike)',
    vehicleModel: 'Bike Elétrica Caloi E-Vibe',
    bikeMaxRadiusKm: 3,
    approvalStatus: 'Aprovado',
    createdAt: '2026-11-24T08:45:00.000Z',
  },
  {
    id: 'prof-entregador-util-comb',
    role: 'entregador',
    name: 'Diego Martins',
    document: '061.903.410-70',
    phone: '(51) 99512-6630',
    neighborhood: 'Azenha',
    vehicleType: 'Utilitário / Picape / Van',
    propulsion: 'Combustão',
    vehicleModel: 'Fiat Fiorino Furgão 1.4',
    plate: 'IZB-3D90',
    cnhNumber: '04910288374',
    hasEar: true,
    approvalStatus: 'Aprovado',
    createdAt: '2026-11-24T11:30:00.000Z',
  },
  {
    id: 'prof-pendente-1',
    role: 'entregador',
    name: 'Rafael Oliveira',
    document: '034.819.220-15',
    phone: '(51) 99740-1189',
    neighborhood: 'Floresta',
    vehicleType: 'Utilitário / Picape / Van',
    propulsion: 'Elétrico',
    vehicleModel: 'Renault Kangoo E-Tech',
    plate: 'JBA-2E88',
    cnhNumber: '07120495811',
    hasEar: true,
    approvalStatus: 'Aguardando Aprovação',
    createdAt: '2026-11-25T11:20:00.000Z',
  },
  {
    id: 'prof-pendente-2',
    role: 'motorista',
    name: 'Camila Mendes',
    document: '041.209.630-44',
    phone: '(51) 99603-5520',
    neighborhood: 'Petrópolis',
    vehicleType: 'Carro Pequeno (Passeio)',
    propulsion: 'Combustão',
    vehicleModel: 'Chevrolet Onix Plus 1.0',
    plate: 'JAT-7C19',
    cnhNumber: '08291044733',
    hasEar: true,
    dailyPassInterest: true,
    approvalStatus: 'Aguardando Aprovação',
    createdAt: '2026-11-25T12:05:00.000Z',
  },
];

const demo1Pricing = calculatePricing('rapida', 4.5, 1);
const demo2Pricing = calculatePricing('rota', 0, 5);

const pickup1Coords = resolvePortoAlegreCoordinates(
  'Rua dos Andradas, 1234',
  'Centro Histórico',
  0
);
const stop1Coords = resolvePortoAlegreCoordinates(
  'Av. Getúlio Vargas, 890',
  'Menino Deus',
  1
);

const pickup2Coords = resolvePortoAlegreCoordinates(
  'Rua Padre Chagas, 210',
  'Moinhos de Vento',
  0
);

const demo2StopsRaw = [
  {
    address: 'Rua João Alfredo, 418',
    neighborhood: 'Cidade Baixa',
    expectedRecipient: 'Carla Menezes',
    recipientNote: 'Apto 204 · Interfone 24',
  },
  {
    address: 'Rua General Lima e Silva, 742',
    neighborhood: 'Cidade Baixa',
    expectedRecipient: 'Empório República',
    recipientNote: 'Entregar no balcão',
  },
  {
    address: 'Rua da República, 315',
    neighborhood: 'Cidade Baixa',
    expectedRecipient: 'Gustavo Ribeiro',
    recipientNote: 'Casa térrea',
  },
  {
    address: 'Rua José do Patrocínio, 608',
    neighborhood: 'Cidade Baixa',
    expectedRecipient: 'Atelier Patrocínio',
    recipientNote: 'Portaria lateral',
  },
  {
    address: 'Av. Venâncio Aires, 195',
    neighborhood: 'Cidade Baixa',
    expectedRecipient: 'Dra. Helena Duarte',
    recipientNote: 'Sala 302 · Recepção',
  },
];

export const INITIAL_ORDERS: Order[] = [
  {
    id: 'ord-demo-1',
    code: '#RS-1041',
    type: 'rapida',
    merchantId: 'prof-lojista-1',
    merchantName: 'Café & Livraria do Centro',
    pickupAddress: 'Rua dos Andradas, 1234',
    pickupNeighborhood: 'Centro Histórico',
    pickupLat: pickup1Coords.lat,
    pickupLng: pickup1Coords.lng,
    destinationNeighborhood: 'Menino Deus',
    distanceKm: 4.5,
    packageCount: 1,
    stops: [
      {
        id: 'stop-demo-1-1',
        pickupCode: '#RS-1041',
        sequence: 1,
        address: 'Av. Getúlio Vargas, 890',
        neighborhood: 'Menino Deus',
        expectedRecipient: 'Marcos Teixeira',
        recipientNote: 'Apto 402 · Livros + Café Especial (frágil)',
        lat: stop1Coords.lat,
        lng: stop1Coords.lng,
        delivered: false,
      },
    ],
    grossTotal: demo1Pricing.grossTotal,
    standardPlatformFee: demo1Pricing.standardPlatformFee,
    basePayout: demo1Pricing.basePayout,
    status: 'Aguardando',
    createdAt: '2026-11-25T13:10:00.000Z',
  },
  {
    id: 'ord-demo-2',
    code: '#RS-1042',
    type: 'rota',
    merchantId: 'prof-lojista-2',
    merchantName: 'Empório Moinhos',
    pickupAddress: 'Rua Padre Chagas, 210',
    pickupNeighborhood: 'Moinhos de Vento',
    pickupLat: pickup2Coords.lat,
    pickupLng: pickup2Coords.lng,
    destinationNeighborhood: 'Cidade Baixa',
    packageCount: demo2StopsRaw.length,
    stops: demo2StopsRaw.map((st, idx) => {
      const coords = resolvePortoAlegreCoordinates(
        st.address,
        st.neighborhood,
        idx + 1
      );
      return {
        id: `stop-demo-2-${idx + 1}`,
        pickupCode: `#RS-204${idx + 1}`,
        sequence: idx + 1,
        address: st.address,
        neighborhood: st.neighborhood,
        expectedRecipient: st.expectedRecipient,
        recipientNote: st.recipientNote,
        lat: coords.lat,
        lng: coords.lng,
        delivered: false,
      };
    }),
    grossTotal: demo2Pricing.grossTotal,
    standardPlatformFee: demo2Pricing.standardPlatformFee,
    basePayout: demo2Pricing.basePayout,
    status: 'Aguardando',
    createdAt: '2026-11-25T13:25:00.000Z',
  },
];
