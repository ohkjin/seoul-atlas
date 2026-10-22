import {
  Building2, Bus, Coins, Footprints, House, Landmark, Leaf, Minus, Route, ShoppingBag, ShoppingBasket,
  ShoppingCart, SquareParking, Store, Sun, Sunrise, Thermometer, ThermometerSnowflake, ThermometerSun,
  Ticket, TrainFront, Trees, TrendingDown, TrendingUp, UserRound, Users, Utensils, Wallet, Warehouse,
  type LucideIcon
} from 'lucide-react';
import type {ThemeKey, Variable} from '../data/catalog';

// The picture in front of an infographic card. Most variables have a fixed topic icon;
// where the value itself has a natural picture, the icon follows it — temperature picks
// a cold / mild / hot thermometer, and signed indices point up or down with their sign.
const TOPIC: Record<string, LucideIcon> = {
  temp_max: Thermometer, n_hot_days: Sun, n_mild_days: Leaf,
  elderly_share: UserRound, low_income_share: Wallet, dnpr: Sunrise,
  residential_area_share: House, commercial_area_share: Store, leisure_area_share: Footprints,
  transportation_area_share: Route, public_facility_area_share: Landmark, green_space_share: Trees,
  aged_housing_share: Building2, activity_facility_density: Ticket, land_price: Coins,
  retail_total_amount: ShoppingBag, retail_share: ShoppingCart, dinebev_share_all: Utensils,
  everyday_retail_share_all: ShoppingBasket, general_share_all: Store, large_format_share_all: Warehouse,
  subway_access_coverage: TrainFront, bus_stop_density: Bus, parking_capacity: SquareParking, delta_daypop: Users
};

const THEME_ICON: Record<ThemeKey, LucideIcon> = {
  environment: Leaf, people: Users, urban: Building2, economy: ShoppingBag, mobility: Route, insights: TrendingUp
};

// Below 5 °C reads as a cold day, from 25 °C as a hot one (KMA's summer-day threshold).
const COLD_C = 5, HOT_C = 25;

export function iconFor(x: Variable | undefined, value: number | null): LucideIcon | null {
  if (!x) return null;
  if (x.key === 'temp_max' && value != null) {
    return value < COLD_C ? ThermometerSnowflake : value >= HOT_C ? ThermometerSun : Thermometer;
  }
  if (x.signed && value != null) return value > 0 ? TrendingUp : value < 0 ? TrendingDown : Minus;
  return TOPIC[x.key] ?? THEME_ICON[x.theme];
}
