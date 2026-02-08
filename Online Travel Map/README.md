# Travel Map - Interactive Leaflet Map

An interactive travel map displaying visited locations with photos, filtering, charts, and scoring.

## Features

1. **Interactive Leaflet Map** - Displays all your visited locations on a map
2. **GeoJSON Data** - All location data is stored in `travel_data.geojson` for easy updates
3. **Photo Popups** - Add photos to popups by including a `Photo` property in your GeoJSON
4. **Holiday Type Filtering** - Filter locations by type (City, Ski, Explore, etc.) with custom icons and layer controls
5. **Sunburst Chart** - Interactive Plotly chart showing travel statistics by Continent → Country → Location
6. **Trip List** - View all trips sorted by score in a popup list

## Files

- `travel_map.html` - Main HTML file with all features
- `travel_data.geojson` - Your travel data in GeoJSON format
- `photos/` - Folder for location photos

## Setup

1. Open `travel_map.html` in a web browser
2. The map will automatically load data from `travel_data.geojson`

## Adding/Updating Locations

Edit `travel_data.geojson` to add or update locations. Each feature should have:

```json
{
  "type": "Feature",
  "geometry": {
    "type": "Point",
    "coordinates": [longitude, latitude]
  },
  "properties": {
    "Name": "Location Name",
    "Location": "City/Town",
    "Country": "Country Name",
    "Continent": "Continent Name",
    "Type": "City|Ski|Explore|Rural|Snowboarding|Beach|Mountain|etc",
    "Year": 1234567890000,
    "Score": 8.5,
    "Photo": "filename.jpg",
    "Notes": "Optional notes"
  }
}
```

### Property Details

- **Name** (required): Name of the location
- **Location** (optional): City or town name
- **Country** (optional): Country name
- **Continent** (optional): Continent name (used in chart)
- **Type** (optional): Holiday type - determines icon color and layer grouping
  - Supported types: City, Ski, Explore, Rural, Snowboarding, Beach, Mountain, House, Globe, Flag, Football
- **Year** (optional): Timestamp in milliseconds (used for display)
- **Score** (optional): Numeric score (0-10) for ranking trips
- **Photo** (optional): Filename of photo in the `photos/` folder
- **Notes** (optional): Additional notes about the location

## Adding Photos

1. Place photos in the `photos/` folder
2. Reference them in the GeoJSON `Photo` property (e.g., `"Photo": "paris.jpg"`)
3. Photos will automatically appear in popups

## Features Explained

### Layer Controls
- Use the layer control (top-left) to show/hide different holiday types
- Each type has a unique icon and color

### Chart Button
- Click "Show Chart" to see a sunburst chart
- Shows hierarchy: Continent → Country → Location
- Automatically updates when you add new entries to GeoJSON

### Trip List Button
- Click "Show Trip List" to see all trips sorted by score
- Displays location, country, continent, year, type, and notes
- Highest scored trips appear first

## Customization

### Adding New Holiday Types

Edit the `iconConfig` object in `travel_map.html`:

```javascript
var iconConfig = {
  'YourType': { icon: 'fas fa-icon-name', color: '#hexcolor' },
  // ... existing types
};
```

Available Font Awesome icons: https://fontawesome.com/icons

### Changing Base Maps

Edit the `basemaps` object in the code to add more base map options.

## Notes

- The chart automatically updates when you refresh the page after updating GeoJSON
- Photos that fail to load will be hidden automatically
- Scores default to 0 if not specified
- The map automatically fits to show all your locations
