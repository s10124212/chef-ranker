export interface ChefWithRelations {
  id: string;
  name: string;
  slug: string;
  city: string | null;
  country: string | null;
  currentRestaurant: string | null;
  cuisineSpecialties: string | null;
  yearsExperience: number | null;
  photoUrl: string | null;
  bio: string | null;
  isArchived: boolean;
  totalScore: number;
  rank: number | null;
  accolades: AccoladeData[];
  careerEntries: CareerEntryData[];
  recognitions: RecognitionData[];
  publicSignals: PublicSignalData[];
  peerStandings: PeerStandingData[];
  createdAt: string;
  updatedAt: string;
}

export interface AccoladeData {
  id: string;
  type: string;
  detail: string | null;
  year: number | null;
  sourceUrl: string | null;
}

export interface CareerEntryData {
  id: string;
  role: string;
  restaurant: string;
  city: string | null;
  startYear: number | null;
  endYear: number | null;
  isCurrent: boolean;
  sourceUrl: string | null;
}

export interface RecognitionData {
  id: string;
  title: string;
  category: string | null;
  year: number | null;
  sourceUrl: string | null;
}

export interface PublicSignalData {
  id: string;
  platform: string;
  metric: string | null;
  value: number | null;
  sourceUrl: string | null;
}

export interface PeerStandingData {
  id: string;
  type: string;
  detail: string | null;
  relatedChef: string | null;
  sourceUrl: string | null;
}

export interface ScoreBreakdown {
  formalAccolades: number;
  careerTrack: number;
  publicSignals: number;
  peerStanding: number;
}

export interface ScoringWeights {
  formalAccolades: number;
  careerTrack: number;
  publicSignals: number;
  peerStanding: number;
}

export const DEFAULT_WEIGHTS: ScoringWeights = {
  formalAccolades: 0.35,
  careerTrack: 0.25,
  publicSignals: 0.15,
  peerStanding: 0.25,
};

export interface RankingEntry {
  rank: number;
  chef: ChefWithRelations;
  totalScore: number;
  breakdown: ScoreBreakdown;
  delta: number | null;
}

export interface SnapshotData {
  id: string;
  month: string;
  publishedAt: string | null;
  notes: string | null;
  entries: SnapshotEntryData[];
}

export interface SnapshotEntryData {
  id: string;
  chefId: string;
  rank: number;
  totalScore: number;
  breakdown: ScoreBreakdown | null;
  delta: number | null;
  chef?: {
    name: string;
    slug: string;
    currentRestaurant: string | null;
    city: string | null;
    country: string | null;
  };
}

export interface ManualChefData {
  name: string;
  city?: string;
  country?: string;
  currentRestaurant?: string;
  cuisineSpecialties?: string[];
  yearsExperience?: number;
  bio?: string;
  accolades?: {
    type: string;
    detail?: string;
    year?: number;
    sourceUrl?: string;
  }[];
  career?: {
    role: string;
    restaurant: string;
    city?: string;
    startYear?: number;
    endYear?: number;
    isCurrent?: boolean;
  }[];
  recognitions?: {
    title: string;
    category?: string;
    year?: number;
  }[];
  publicSignals?: {
    platform: string;
    metric?: string;
    value?: number;
  }[];
  peerStandings?: {
    type: string;
    detail?: string;
    relatedChef?: string;
  }[];
}
