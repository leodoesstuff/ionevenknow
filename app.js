const cities = [
  { name: "New York", country: "US", lat: 40.7128, lon: -74.006 },
  { name: "London", country: "UK", lat: 51.5072, lon: -0.1276 },
  { name: "Tokyo", country: "JP", lat: 35.6762, lon: 139.6503 },
  { name: "Sydney", country: "AU", lat: -33.8688, lon: 151.2093 },
  { name: "Cape Town", country: "ZA", lat: -33.9249, lon: 18.4241 },
  { name: "São Paulo", country: "BR", lat: -23.5505, lon: -46.6333 },
  { name: "Mumbai", country: "IN", lat: 19.076, lon: 72.8777 },
  { name: "Dubai", country: "AE", lat: 25.2048, lon: 55.2708 }
];

const cityPicker = document.querySelector("#city-picker");
const refreshBtn = document.querySelector("#refresh-btn");
const current = document.querySelector("#current");
const forecast = document.querySelector("#forecast");
const worldGrid = document.querySelector("#world-grid");
const statusEl = document.querySelector("#status");

cities.forEach((city, index) => {
  const option = document.createElement("option");
  option.value = String(index);
  option.textContent = `${city.name}, ${city.country}`;
  cityPicker.append(option);
});

async function fetchWeather(city) {
  const params = new URLSearchParams({
    latitude: String(city.lat),
    longitude: String(city.lon),
    current: "temperature_2m,relative_humidity_2m,cloud_cover,wind_speed_10m",
    daily: "temperature_2m_max,temperature_2m_min,cloud_cover_mean,precipitation_probability_max",
    forecast_days: "3",
    timezone: "auto"
  });

  const url = `https://api.open-meteo.com/v1/forecast?${params}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to load weather (${res.status})`);
  }
  return res.json();
}

function renderCurrent(city, data) {
  const c = data.current;
  current.innerHTML = `
    <h2>${city.name}, ${city.country}</h2>
    <p><strong>${Math.round(c.temperature_2m)}°C</strong> · Cloud cover ${c.cloud_cover}%</p>
    <p>Humidity ${c.relative_humidity_2m}% · Wind ${Math.round(c.wind_speed_10m)} km/h</p>
    <small>Last update: ${new Date(c.time).toLocaleString()}</small>
  `;
}

function renderForecast(data) {
  const days = data.daily.time.map((time, i) => ({
    date: new Date(time),
    min: data.daily.temperature_2m_min[i],
    max: data.daily.temperature_2m_max[i],
    clouds: data.daily.cloud_cover_mean[i],
    rainChance: data.daily.precipitation_probability_max[i]
  }));

  forecast.innerHTML = days
    .map(
      (day) => `
      <article class="day-card">
        <h3>${day.date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}</h3>
        <p>${Math.round(day.min)}° / ${Math.round(day.max)}°</p>
        <p>☁️ Clouds: ${day.clouds}%</p>
        <p>🌧️ Rain chance: ${day.rainChance}%</p>
      </article>
    `
    )
    .join("");
}

async function renderWorldGrid() {
  const cards = await Promise.all(
    cities.map(async (city) => {
      try {
        const data = await fetchWeather(city);
        return {
          city,
          temp: Math.round(data.current.temperature_2m),
          clouds: data.current.cloud_cover,
          wind: Math.round(data.current.wind_speed_10m)
        };
      } catch {
        return { city, error: true };
      }
    })
  );

  worldGrid.innerHTML = cards
    .map((card) => {
      if (card.error) {
        return `<article class="world-card"><h3>${card.city.name}</h3><p>Weather unavailable</p></article>`;
      }

      return `
        <article class="world-card">
          <h3>${card.city.name}</h3>
          <p>${card.temp}°C</p>
          <p>☁️ ${card.clouds}% clouds</p>
          <p>💨 ${card.wind} km/h wind</p>
        </article>
      `;
    })
    .join("");
}

async function loadSelectedCity() {
  const city = cities[Number(cityPicker.value) || 0];
  statusEl.textContent = `Loading ${city.name} weather...`;

  try {
    const data = await fetchWeather(city);
    renderCurrent(city, data);
    renderForecast(data);
    statusEl.textContent = `Updated ${city.name}.`;
  } catch (error) {
    statusEl.textContent = `Could not load ${city.name}: ${error.message}`;
  }
}

refreshBtn.addEventListener("click", async () => {
  await Promise.all([loadSelectedCity(), renderWorldGrid()]);
});

cityPicker.addEventListener("change", loadSelectedCity);

await Promise.all([loadSelectedCity(), renderWorldGrid()]);
