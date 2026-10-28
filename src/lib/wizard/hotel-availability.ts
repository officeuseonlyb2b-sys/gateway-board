export interface HotelCityRef {
  id: string;
  name: string;
}

export interface AccommodationRouteRef {
  city_id?: string;
  to_city_id?: string;
  to_city_ids?: string[];
  to_city?: string;
}

export interface HotelAvailabilityRecord {
  id: string;
  name: string;
  city_id: string;
  hotel_category: string;
  blackout_ranges?: { from: string; to: string }[];
}

export interface HotelRoomRecord {
  id: string;
  hotel_id: string;
}

export interface HotelRateRecord {
  room_category_id: string;
  validity_start: string;
  validity_end: string;
  single_rate?: number;
  double_rate?: number;
  quad_rate?: number | null;
  include_in_quote?: boolean;
}

export const normalizeHotelLookupValue = (value: string | null | undefined) =>
  (value ?? "").trim().replace(/\s+/g, " ").toLocaleLowerCase();

/** Resolve legacy/text routing through the canonical city collection used by hotels. */
export function resolveAccommodationCity(
  route: AccommodationRouteRef,
  hotelCities: HotelCityRef[],
  destinationCities: HotelCityRef[] = [],
): HotelCityRef | undefined {
  // RoutingDay.city_id is the overnight city used for accommodation. A route's
  // to_city may describe a sightseeing destination visited during that day.
  const overnightId = route.city_id;
  if (overnightId) {
    const directHotelCity = hotelCities.find((city) => city.id === overnightId);
    if (directHotelCity) return directHotelCity;

    const overnightDestination = destinationCities.find((city) => city.id === overnightId);
    if (overnightDestination) {
      const key = normalizeHotelLookupValue(overnightDestination.name);
      const matchingHotelCity = hotelCities.find(
        (city) => normalizeHotelLookupValue(city.name) === key,
      );
      if (matchingHotelCity) return matchingHotelCity;
    }
  }

  // Fall back to the displayed destination only for legacy routes whose
  // overnight city ID cannot be resolved through either master collection.
  const nameKey = normalizeHotelLookupValue(route.to_city);
  if (nameKey) {
    const byName =
      hotelCities.find((city) => normalizeHotelLookupValue(city.name) === nameKey) ??
      destinationCities.find((city) => normalizeHotelLookupValue(city.name) === nameKey);
    if (byName) {
      return (
        hotelCities.find(
          (city) => normalizeHotelLookupValue(city.name) === normalizeHotelLookupValue(byName.name),
        ) ?? byName
      );
    }
  }

  const ids = [
    ...(route.to_city_ids ?? []).slice().reverse(),
    route.to_city_id,
    route.city_id,
  ].filter((id): id is string => Boolean(id));

  for (const id of ids) {
    const direct = hotelCities.find((city) => city.id === id);
    if (direct) return direct;

    const destination = destinationCities.find((city) => city.id === id);
    if (destination) {
      const key = normalizeHotelLookupValue(destination.name);
      return (
        hotelCities.find((city) => normalizeHotelLookupValue(city.name) === key) ?? destination
      );
    }
  }

  return undefined;
}

export function cityNameForHotel(
  cityId: string,
  hotelCities: HotelCityRef[],
  destinationCities: HotelCityRef[] = [],
) {
  return (
    hotelCities.find((city) => city.id === cityId)?.name ??
    destinationCities.find((city) => city.id === cityId)?.name ??
    ""
  );
}

export function hotelsForAccommodation<
  THotel extends {
    city_id: string;
    hotel_category: string;
  },
>(
  hotels: THotel[],
  cityName: string,
  category: string,
  hotelCities: HotelCityRef[],
  destinationCities: HotelCityRef[] = [],
  canonicalCityId?: string,
) {
  const cityKey = normalizeHotelLookupValue(cityName);
  const categoryKey = normalizeHotelLookupValue(category);
  const inCity = cityKey
    ? hotels.filter(
        (hotel) =>
          (canonicalCityId !== undefined && hotel.city_id === canonicalCityId) ||
          normalizeHotelLookupValue(
            cityNameForHotel(hotel.city_id, hotelCities, destinationCities),
          ) === cityKey,
      )
    : [];
  return {
    inCity,
    inCategory: inCity.filter(
      (hotel) => normalizeHotelLookupValue(hotel.hotel_category) === categoryKey,
    ),
  };
}

export function diagnoseHotelAvailability(
  hotels: HotelAvailabilityRecord[],
  rooms: HotelRoomRecord[],
  rates: HotelRateRecord[],
  cityName: string,
  category: string,
  date: string,
  hotelCities: HotelCityRef[],
  destinationCities: HotelCityRef[] = [],
  canonicalCityId?: string,
) {
  const cityKey = normalizeHotelLookupValue(cityName);
  const categoryKey = normalizeHotelLookupValue(category);
  const details = hotels.map((hotel) => {
    const storedCity = cityNameForHotel(hotel.city_id, hotelCities, destinationCities);
    const cityMatches =
      (canonicalCityId !== undefined && hotel.city_id === canonicalCityId) ||
      normalizeHotelLookupValue(storedCity) === cityKey;
    const categoryMatches = normalizeHotelLookupValue(hotel.hotel_category) === categoryKey;
    const blackout = (hotel.blackout_ranges ?? []).some(
      (range) => range.from <= date && range.to >= date,
    );
    const hotelRooms = rooms.filter((room) => room.hotel_id === hotel.id);
    const roomIds = new Set(hotelRooms.map((room) => room.id));
    const hotelRates = rates.filter((rate) => roomIds.has(rate.room_category_id));
    const includedRates = hotelRates.filter((rate) => rate.include_in_quote !== false);
    const applicableRates = includedRates.filter(
      (rate) => ratePlanMatchesDate(rate, date) && ratePlanHasPrice(rate),
    );
    const reasons: string[] = [];
    if (!cityMatches) reasons.push(`city is ${storedCity || "unresolved"}, not ${cityName}`);
    if (cityMatches && !categoryMatches)
      reasons.push(`category is ${hotel.hotel_category}, not ${category}`);
    if (cityMatches && categoryMatches && hotelRooms.length === 0)
      reasons.push("no room records linked to hotel ID");
    if (cityMatches && categoryMatches && hotelRooms.length > 0 && hotelRates.length === 0)
      reasons.push("rooms exist but no rate plans are linked");
    if (cityMatches && categoryMatches && hotelRates.length > 0 && applicableRates.length === 0)
      reasons.push(`no included rate plan valid on ${date}`);
    if (cityMatches && categoryMatches && blackout)
      reasons.push(`hotel blackout applies on ${date}`);
    return {
      id: hotel.id,
      name: hotel.name,
      city_id: hotel.city_id,
      city_name: storedCity,
      hotel_category: hotel.hotel_category,
      cityMatches,
      categoryMatches,
      blackout,
      roomCount: hotelRooms.length,
      rateCount: hotelRates.length,
      applicableRateCount: applicableRates.length,
      dropdownEligible: cityMatches && categoryMatches,
      pricingEligible:
        cityMatches &&
        categoryMatches &&
        hotelRooms.length > 0 &&
        applicableRates.length > 0 &&
        !blackout,
      rejectionReason: reasons.join("; ") || "eligible",
    };
  });
  return {
    totalHotels: hotels.length,
    cityMatches: details.filter((hotel) => hotel.cityMatches).length,
    categoryMatches: details.filter((hotel) => hotel.cityMatches && hotel.categoryMatches).length,
    withRooms: details.filter(
      (hotel) => hotel.cityMatches && hotel.categoryMatches && hotel.roomCount > 0,
    ).length,
    withRatePlans: details.filter(
      (hotel) => hotel.cityMatches && hotel.categoryMatches && hotel.rateCount > 0,
    ).length,
    validForDate: details.filter((hotel) => hotel.pricingEligible).length,
    finalDropdownCount: details.filter((hotel) => hotel.dropdownEligible).length,
    details,
  };
}
import { ratePlanHasPrice, ratePlanMatchesDate } from "@/lib/wizard/rate-lookup";
