export type TabId = 'lojista' | 'entregador' | 'cadastro' | 'admin';

export type OrderType = 'rapida' | 'rota' | 'frete';

export type OrderStatus = 'Aguardando' | 'Em Rota' | 'Entregue';

export type UserRole = 'lojista' | 'entregador' | 'motorista' | 'admin';

export type VehicleType =
  | 'Bike'
  | 'Moto'
  | 'Carro Pequeno (Passeio)'
  | 'Utilitário / Picape / Van';

export type PropulsionType =
  | 'Elétrico'
  | 'Combustão'
  | 'Propulsão Humana (Convencional)'
  | 'Elétrica / Pedal Assistido (E-Bike)';

export type ApprovalStatus = 'Aguardando Aprovação' | 'Aprovado' | 'Bloqueado';

export type CargoSize = 'medio' | 'grande';

export type PixKeyType = 'CPF' | 'Telefone' | 'E-mail' | 'Chave Aleatória';

export type PixPaymentMethod = 'pix_direto' | 'pix_plataforma';

export type PaymentStatus = 'pendente_pagamento' | 'pago_lojista' | 'repassado';

export type PersonType = 'PF' | 'PJ';

export interface FreightDetails {
  cargoDescription: string;
  cargoSize: CargoSize;
  includeHelper: boolean;
  accessNote: string;
}

export interface Profile {
  id: string;
  role: UserRole;
  personType?: PersonType;
  name: string;
  businessName?: string;
  companyLegalName?: string;
  document: string; // CPF ou CNPJ formatado ou dígitos
  documentNumber?: string; // Somente dígitos numéricos
  phone: string;
  email?: string;
  pixKey?: string;
  neighborhood: string;
  address?: string;
  twoFactorEnabled?: boolean;
  vehicleType?: VehicleType;
  propulsion?: PropulsionType;
  vehicleModel?: string;
  plate?: string;
  cnhNumber?: string;
  hasEar?: boolean;
  dailyPassInterest?: boolean;
  bikeMaxRadiusKm?: number | null;
  approvalStatus: ApprovalStatus;
  createdAt: string;
}

export interface DeliveryStop {
  id: string;
  sequence: number;
  address: string;
  neighborhood: string;
  expectedRecipient?: string;
  recipientNote?: string;
  lat?: number;
  lng?: number;
  delivered: boolean;
  receiverName?: string;
  proofPhotoDataUrl?: string;
  deliveredAt?: string;
}

export interface Order {
  id: string;
  code: string;
  type: OrderType;
  merchantId: string;
  merchantName: string;
  pickupAddress: string;
  pickupNeighborhood: string;
  pickupLat?: number;
  pickupLng?: number;
  destinationNeighborhood: string;
  distanceKm?: number; // For 'rapida' and 'frete'
  packageCount: number; // 1 for 'rapida'/'frete', N for 'rota'
  freightDetails?: FreightDetails;
  stops: DeliveryStop[];
  grossTotal: number; // Valor total do pedido pago pelo lojista
  standardPlatformFee: number; // Taxa padrão fixa (R$ 0,50, R$ 0,30/pacote ou R$ 3,00 frete)
  basePayout: number; // Repasse base após taxa padrão
  status: OrderStatus;
  paymentMethod?: PixPaymentMethod;
  paymentStatus?: PaymentStatus;
  assignedCourierId?: string;
  assignedCourierName?: string;
  assignedCourierPixKey?: string;
  assignedCourierPropulsion?: PropulsionType;
  appliedPlatformFee?: number;
  evBonusApplied?: number;
  netCourierPayout?: number;
  createdAt: string;
  acceptedAt?: string;
  completedAt?: string;
}

export interface PricingBreakdown {
  grossTotal: number;
  baseComponent: number;
  extraDistanceComponent: number;
  extraKm: number;
  cargoSizeComponent: number;
  helperComponent: number;
  standardPlatformFee: number;
  basePayout: number;
  evBonus: number;
  evNetPayout: number;
  combustionPlatformFee: number;
  combustionNetPayout: number;
}
