/**
 * Weather forecast utility using the free Open-Meteo API.
 * No API key required.
 * https://open-meteo.com/
 */

export type DailyForecast = {
  date: string; // YYYY-MM-DD
  tempMax: number; // °C
  tempMin: number; // °C
  precipitation: number; // mm
  weatherCode: number;
  weatherLabel: string;
  weatherIcon: string; // emoji
};

export type WeatherForecast = {
  location: string;
  latitude: number;
  longitude: number;
  days: DailyForecast[];
  fetchedAtMs: number;
};

// ---------------------------------------------------------------------------
// WMO Weather interpretation codes -> emoji + label
// https://www.nodc.noaa.gov/archive/arc0021/0002199/1.1/data/0-data/HTML/WMO-CODE/WMO4677.HTM
// ---------------------------------------------------------------------------

function getWeatherInfo(code: number): { label: string; icon: string } {
  switch (code) {
    case 0:
      return { label: "Clear sky", icon: "\u2600\uFE0F" };
    case 1:
      return { label: "Mainly clear", icon: "\uD83C\uDF24\uFE0F" };
    case 2:
      return { label: "Partly cloudy", icon: "\u26C5" };
    case 3:
      return { label: "Overcast", icon: "\u2601\uFE0F" };
    case 45:
      return { label: "Fog", icon: "\uD83C\uDF2B\uFE0F" };
    case 48:
      return { label: "Depositing rime fog", icon: "\uD83C\uDF2B\uFE0F" };
    case 51:
      return { label: "Light drizzle", icon: "\uD83C\uDF26\uFE0F" };
    case 53:
      return { label: "Moderate drizzle", icon: "\uD83C\uDF26\uFE0F" };
    case 55:
      return { label: "Dense drizzle", icon: "\uD83C\uDF26\uFE0F" };
    case 56:
      return { label: "Light freezing drizzle", icon: "\uD83C\uDF27\uFE0F" };
    case 57:
      return { label: "Dense freezing drizzle", icon: "\uD83C\uDF27\uFE0F" };
    case 61:
      return { label: "Slight rain", icon: "\uD83C\uDF27\uFE0F" };
    case 63:
      return { label: "Moderate rain", icon: "\uD83C\uDF27\uFE0F" };
    case 65:
      return { label: "Heavy rain", icon: "\uD83C\uDF27\uFE0F" };
    case 66:
      return { label: "Light freezing rain", icon: "\uD83C\uDF27\uFE0F" };
    case 67:
      return { label: "Heavy freezing rain", icon: "\uD83C\uDF27\uFE0F" };
    case 71:
      return { label: "Slight snow", icon: "\u2744\uFE0F" };
    case 73:
      return { label: "Moderate snow", icon: "\u2744\uFE0F" };
    case 75:
      return { label: "Heavy snow", icon: "\u2744\uFE0F" };
    case 77:
      return { label: "Snow grains", icon: "\u2744\uFE0F" };
    case 80:
      return { label: "Slight rain showers", icon: "\uD83C\uDF26\uFE0F" };
    case 81:
      return { label: "Moderate rain showers", icon: "\uD83C\uDF27\uFE0F" };
    case 82:
      return { label: "Violent rain showers", icon: "\uD83C\uDF27\uFE0F" };
    case 85:
      return { label: "Slight snow showers", icon: "\uD83C\uDF28\uFE0F" };
    case 86:
      return { label: "Heavy snow showers", icon: "\uD83C\uDF28\uFE0F" };
    case 95:
      return { label: "Thunderstorm", icon: "\u26C8\uFE0F" };
    case 96:
      return { label: "Thunderstorm with slight hail", icon: "\u26C8\uFE0F" };
    case 99:
      return { label: "Thunderstorm with heavy hail", icon: "\u26C8\uFE0F" };
    default:
      return { label: "Unknown", icon: "\uD83C\uDF10" };
  }
}

// ---------------------------------------------------------------------------
// Open-Meteo response shape (only the fields we use)
// ---------------------------------------------------------------------------

type OpenMeteoResponse = {
  daily: {
    time: string[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    precipitation_sum: number[];
    weathercode: number[];
  };
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function fetchWeatherForecast(
  latitude: number,
  longitude: number,
  location: string
): Promise<WeatherForecast> {
  const url =
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${latitude}` +
    `&longitude=${longitude}` +
    `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,weathercode` +
    `&timezone=auto` +
    `&forecast_days=7`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `Weather API request failed with status ${response.status}`
    );
  }

  const data: OpenMeteoResponse = await response.json();

  const days: DailyForecast[] = data.daily.time.map((date, index) => {
    const code = data.daily.weathercode[index];
    const { label, icon } = getWeatherInfo(code);

    return {
      date,
      tempMax: Math.round(data.daily.temperature_2m_max[index]),
      tempMin: Math.round(data.daily.temperature_2m_min[index]),
      precipitation: Math.round(data.daily.precipitation_sum[index] * 10) / 10,
      weatherCode: code,
      weatherLabel: label,
      weatherIcon: icon,
    };
  });

  return {
    location,
    latitude,
    longitude,
    days,
    fetchedAtMs: Date.now(),
  };
}
