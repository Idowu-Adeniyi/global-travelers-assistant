require("dotenv").config();
const express = require("express");
const https = require("https");
const path = require("path");

const app = express();
const port = process.env.PORT || 3000;

// Set view engine to Pug
app.set("view engine", "pug");
app.set("views", path.join(__dirname, "views"));

// Middleware to serve static files (CSS, images, etc.)
app.use(express.static(path.join(__dirname, "public")));

// Middleware to parse URL-encoded data from forms
app.use(express.urlencoded({ extended: true }));

// Function to fetch weather and cafe details for a city
function fetchCityData(city, callback) {
  const weatherUrl = `https://api.openweathermap.org/data/2.5/weather?q=${city}&appid=${process.env.OPENWEATHERMAP_API_KEY}&units=metric`;
  const yelpUrl = `https://api.yelp.com/v3/businesses/search?term=cafe&location=${city}`;

  // Fetch weather data from OpenWeatherMap API
  https
    .get(weatherUrl, (weatherResponse) => {
      let weatherData = "";
      weatherResponse.on("data", (data) => {
        weatherData += data;
      });
      weatherResponse.on("end", () => {
        weatherData = JSON.parse(weatherData);

        // Fetch cafes from Yelp API
        const yelpRequest = https.request(
          {
            hostname: "api.yelp.com",
            path: yelpUrl,
            method: "GET",
            headers: {
              Authorization: `Bearer ${process.env.YELP_API_KEY}`,
            },
          },
          (yelpResponse) => {
            let yelpData = "";
            yelpResponse.on("data", (data) => {
              yelpData += data;
            });

            yelpResponse.on("end", () => {
              const yelpBusinesses = JSON.parse(yelpData);
              if (yelpBusinesses.error) {
                return callback(
                  `Error fetching Yelp data: ${yelpBusinesses.error.description}`,
                  null
                );
              }

              // Extract the weather and cafe data
              const weather = {
                temp: weatherData.main.temp,
                condition: weatherData.weather[0].description,
                icon: weatherData.weather[0].icon, // Weather icon code
              };

              const cafe = yelpBusinesses.businesses[0] || {
                name: "No cafe found",
                image_url: "",
              };

              callback(null, { weather, cafe });
            });
          }
        );

        yelpRequest.on("error", (error) => {
          callback("Error fetching Yelp data", null);
        });

        yelpRequest.end();
      });
    })
    .on("error", (error) => {
      callback("Error fetching weather data", null);
    });
}

// Home route (city search form)
app.get("/", (req, res) => {
  // Fetch weather and cafe data for Vancouver and Toronto
  const cities = ["Vancouver", "Toronto"];
  let cityData = {};
  let completedRequests = 0;

  cities.forEach((city) => {
    fetchCityData(city, (error, data) => {
      if (error) {
        return res.send(error);
      }

      cityData[city] = data;

      // Check if both cities have been processed
      completedRequests++;
      if (completedRequests === cities.length) {
        // Pass the fetched data to the homepage view
        res.render("index", {
          vancouverWeather: cityData["Vancouver"].weather,
          vancouverCafeImage: cityData["Vancouver"].cafe.image_url,
          vancouverCafeName: cityData["Vancouver"].cafe.name,
          torontoWeather: cityData["Toronto"].weather,
          torontoCafeImage: cityData["Toronto"].cafe.image_url,
          torontoCafeName: cityData["Toronto"].cafe.name,
        });
      }
    });
  });
});

// About page route
app.get("/about", (req, res) => {
  res.render("about");
});

// Contact page route
app.get("/contact", (req, res) => {
  res.render("contact");
});

app.post("/contact", (req, res) => {
  res.redirect("/");
});

// Search route (fetch data from APIs and display results)
app.get("/search", (req, res) => {
  const city = req.query.city;
  if (!city) {
    return res.redirect("/");
  }

  // Fetch weather data from OpenWeatherMap API
  https.get(
    `https://api.openweathermap.org/data/2.5/weather?q=${city}&appid=${process.env.OPENWEATHERMAP_API_KEY}&units=metric`,
    (weatherResponse) => {
      let weatherData = "";

      weatherResponse.on("data", (data) => {
        weatherData += data;
      });

      weatherResponse.on("end", () => {
        try {
          weatherData = JSON.parse(weatherData);

          if (weatherData.cod !== 200) {
            return res.send(
              `Error fetching weather data: ${weatherData.message}`
            );
          }

          // Fetch time zone data from WorldTimeAPI (Free)
          https.get(
            `https://worldtimeapi.org/api/timezone/Etc/GMT`,
            (timeZoneResponse) => {
              let timeZoneData = "";

              timeZoneResponse.on("data", (data) => {
                timeZoneData += data;
              });

              timeZoneResponse.on("end", () => {
                try {
                  timeZoneData = JSON.parse(timeZoneData);

                  // Fetch nearby cafes using Yelp API
                  const yelpRequest = https.request(
                    {
                      hostname: "api.yelp.com",
                      path: `/v3/businesses/search?term=cafe&location=${city}`,
                      method: "GET",
                      headers: {
                        Authorization: `Bearer ${process.env.YELP_API_KEY}`,
                      },
                    },
                    (yelpResponse) => {
                      let yelpBusinesses = "";

                      yelpResponse.on("data", (data) => {
                        yelpBusinesses += data;
                      });

                      yelpResponse.on("end", () => {
                        try {
                          yelpBusinesses = JSON.parse(yelpBusinesses);

                          if (yelpBusinesses.error) {
                            return res.send(
                              `Error fetching Yelp data: ${yelpBusinesses.error.description}`
                            );
                          }

                          // Format sunrise and sunset time
                          const sunrise = new Date(
                            weatherData.sys.sunrise * 1000
                          ).toLocaleTimeString();
                          const sunset = new Date(
                            weatherData.sys.sunset * 1000
                          ).toLocaleTimeString();

                          // Render the results page with all the data
                          res.render("results", {
                            city,
                            weather: {
                              temp: weatherData.main.temp,
                              humidity: weatherData.main.humidity,
                              wind_speed: weatherData.wind.speed,
                              sunrise,
                              sunset,
                            },
                            timeInfo: {
                              current_time: timeZoneData.utc_datetime,
                              timezone: timeZoneData.timezone,
                            },
                            yelpBusinesses: yelpBusinesses.businesses,
                          });
                        } catch (error) {
                          console.error("Error parsing Yelp response:", error);
                          res.send("Error parsing Yelp response");
                        }
                      });

                      yelpResponse.on("error", (error) => {
                        console.error("Error with Yelp API:", error);
                        res.send("Error fetching Yelp data");
                      });
                    }
                  );

                  yelpRequest.on("error", (error) => {
                    console.error("Error with Yelp API request:", error);
                    res.send("Error with Yelp API request");
                  });

                  yelpRequest.end();
                } catch (error) {
                  console.error("Error parsing TimeZoneAPI response:", error);
                  res.send("Error parsing TimeZoneAPI response");
                }
              });

              timeZoneResponse.on("error", (error) => {
                console.error("Error with TimeZone API:", error);
                res.send("Error fetching TimeZone data");
              });
            }
          );
        } catch (error) {
          console.error("Error parsing weather response:", error);
          res.send("Error parsing weather response");
        }
      });

      weatherResponse.on("error", (error) => {
        console.error("Error with OpenWeatherMap API:", error);
        res.send("Error fetching weather data");
      });
    }
  );
});

// Start the server
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
