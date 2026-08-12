"""Coordinates for the map, without a geocoding bill.

Job boards write locations as prose, and prose does not plot. This turns a
location string into a point using a fixed gazetteer of the places design jobs
are actually posted, which is a few hundred cities rather than the whole world.
A static table means no API key, no rate limit, no per-build network cost, and
the same answer every night.

Anything unrecognised stays off the map rather than being guessed onto it. The
board lists those jobs separately instead of quietly dropping them.
"""

from __future__ import annotations

import re

# (label, country, lat, lon). Ordered within a country by how much hiring
# happens there, so the first match on an ambiguous string is the likelier one.
GAZETTEER: tuple[tuple[str, str, float, float, tuple[str, ...]], ...] = (
    # --- India ---
    ("Bengaluru", "IN", 12.9716, 77.5946, ("bengaluru", "bangalore", "blr", "whitefield", "koramangala", "indiranagar", "electronic city")),
    ("Delhi NCR", "IN", 28.6139, 77.2090, ("delhi", "new delhi", "gurgaon", "gurugram", "noida", "ncr", "faridabad", "ghaziabad")),
    ("Mumbai", "IN", 19.0760, 72.8777, ("mumbai", "bombay", "navi mumbai", "thane", "powai", "andheri", "bkc", "goregaon")),
    ("Hyderabad", "IN", 17.3850, 78.4867, ("hyderabad", "secunderabad", "hitec city", "gachibowli")),
    ("Pune", "IN", 18.5204, 73.8567, ("pune", "pimpri", "hinjewadi", "kharadi", "baner")),
    ("Chennai", "IN", 13.0827, 80.2707, ("chennai", "madras", "omr", "guindy")),
    ("Kolkata", "IN", 22.5726, 88.3639, ("kolkata", "calcutta", "salt lake")),
    ("Ahmedabad", "IN", 23.0225, 72.5714, ("ahmedabad", "gandhinagar", "gift city")),
    ("Jaipur", "IN", 26.9124, 75.7873, ("jaipur",)),
    ("Indore", "IN", 22.7196, 75.8577, ("indore",)),
    ("Kochi", "IN", 9.9312, 76.2673, ("kochi", "cochin", "ernakulam", "trivandrum", "thiruvananthapuram")),
    ("Chandigarh", "IN", 30.7333, 76.7794, ("chandigarh", "mohali", "panchkula")),
    ("Coimbatore", "IN", 11.0168, 76.9558, ("coimbatore",)),
    ("Bhubaneswar", "IN", 20.2961, 85.8245, ("bhubaneswar", "odisha")),
    ("Goa", "IN", 15.2993, 74.1240, ("goa", "panaji")),
    ("Nagpur", "IN", 21.1458, 79.0882, ("nagpur",)),
    ("Lucknow", "IN", 26.8467, 80.9462, ("lucknow",)),
    ("Vadodara", "IN", 22.3072, 73.1812, ("vadodara", "baroda", "surat")),

    # --- Rest of Asia-Pacific ---
    ("Singapore", "SG", 1.3521, 103.8198, ("singapore",)),
    ("Tokyo", "JP", 35.6762, 139.6503, ("tokyo", "japan")),
    ("Sydney", "AU", -33.8688, 151.2093, ("sydney",)),
    ("Melbourne", "AU", -37.8136, 144.9631, ("melbourne",)),
    ("Hong Kong", "HK", 22.3193, 114.1694, ("hong kong",)),
    ("Seoul", "KR", 37.5665, 126.9780, ("seoul", "south korea")),
    ("Shanghai", "CN", 31.2304, 121.4737, ("shanghai",)),
    ("Beijing", "CN", 39.9042, 116.4074, ("beijing",)),
    ("Jakarta", "ID", -6.2088, 106.8456, ("jakarta", "indonesia")),
    ("Kuala Lumpur", "MY", 3.1390, 101.6869, ("kuala lumpur", "malaysia")),
    ("Manila", "PH", 14.5995, 120.9842, ("manila", "philippines")),
    ("Bangkok", "TH", 13.7563, 100.5018, ("bangkok", "thailand")),
    ("Ho Chi Minh City", "VN", 10.8231, 106.6297, ("ho chi minh", "saigon", "hanoi", "vietnam")),
    ("Auckland", "NZ", -36.8485, 174.7633, ("auckland", "new zealand")),
    ("Dubai", "AE", 25.2048, 55.2708, ("dubai", "abu dhabi", "uae", "united arab emirates")),
    ("Tel Aviv", "IL", 32.0853, 34.7818, ("tel aviv", "israel")),
    ("Colombo", "LK", 6.9271, 79.8612, ("colombo", "sri lanka")),
    ("Dhaka", "BD", 23.8103, 90.4125, ("dhaka", "bangladesh")),

    # --- North America ---
    ("San Francisco", "US", 37.7749, -122.4194, ("san francisco", "sf bay", "bay area", "sfo")),
    ("Palo Alto", "US", 37.4419, -122.1430, ("palo alto", "mountain view", "menlo park", "sunnyvale", "santa clara", "cupertino", "san jose", "silicon valley")),
    ("New York", "US", 40.7128, -74.0060, ("new york", "nyc", "brooklyn", "manhattan")),
    ("Seattle", "US", 47.6062, -122.3321, ("seattle", "bellevue", "redmond")),
    ("Los Angeles", "US", 34.0522, -118.2437, ("los angeles", "santa monica", "pasadena", "irvine", "san diego")),
    ("Austin", "US", 30.2672, -97.7431, ("austin",)),
    ("Boston", "US", 42.3601, -71.0589, ("boston", "cambridge, ma", "massachusetts")),
    ("Chicago", "US", 41.8781, -87.6298, ("chicago", "illinois")),
    ("Denver", "US", 39.7392, -104.9903, ("denver", "boulder", "colorado")),
    ("Atlanta", "US", 33.7490, -84.3880, ("atlanta", "georgia")),
    ("Miami", "US", 25.7617, -80.1918, ("miami", "florida")),
    ("Washington DC", "US", 38.9072, -77.0369, ("washington", "arlington", "virginia", "maryland")),
    ("Portland", "US", 45.5152, -122.6784, ("portland", "oregon")),
    ("Salt Lake City", "US", 40.7608, -111.8910, ("salt lake", "utah")),
    ("Phoenix", "US", 33.4484, -112.0740, ("phoenix", "arizona", "tempe")),
    ("Dallas", "US", 32.7767, -96.7970, ("dallas", "houston", "texas")),
    ("Toronto", "CA", 43.6532, -79.3832, ("toronto", "ontario", "waterloo")),
    ("Vancouver", "CA", 49.2827, -123.1207, ("vancouver", "british columbia")),
    ("Montreal", "CA", 45.5017, -73.5673, ("montreal", "quebec")),
    ("Mexico City", "MX", 19.4326, -99.1332, ("mexico city", "cdmx", "guadalajara", "mexico")),

    # --- Europe ---
    ("London", "GB", 51.5074, -0.1278, ("london",)),
    ("Manchester", "GB", 53.4808, -2.2426, ("manchester", "leeds", "birmingham", "bristol", "edinburgh", "glasgow")),
    ("Dublin", "IE", 53.3498, -6.2603, ("dublin", "ireland")),
    ("Berlin", "DE", 52.5200, 13.4050, ("berlin",)),
    ("Munich", "DE", 48.1351, 11.5820, ("munich", "münchen", "hamburg", "frankfurt", "cologne", "köln", "stuttgart", "düsseldorf")),
    ("Amsterdam", "NL", 52.3676, 4.9041, ("amsterdam", "netherlands", "rotterdam", "utrecht", "eindhoven")),
    ("Paris", "FR", 48.8566, 2.3522, ("paris", "france", "lyon", "toulouse")),
    ("Madrid", "ES", 40.4168, -3.7038, ("madrid", "spain")),
    ("Barcelona", "ES", 41.3851, 2.1734, ("barcelona", "valencia")),
    ("Lisbon", "PT", 38.7223, -9.1393, ("lisbon", "lisboa", "porto", "portugal")),
    ("Milan", "IT", 45.4642, 9.1900, ("milan", "milano", "rome", "roma", "italy")),
    ("Zurich", "CH", 47.3769, 8.5417, ("zurich", "zürich", "geneva", "switzerland", "lausanne")),
    ("Stockholm", "SE", 59.3293, 18.0686, ("stockholm", "sweden", "gothenburg", "malmö")),
    ("Copenhagen", "DK", 55.6761, 12.5683, ("copenhagen", "denmark")),
    ("Oslo", "NO", 59.9139, 10.7522, ("oslo", "norway")),
    ("Helsinki", "FI", 60.1699, 24.9384, ("helsinki", "finland")),
    ("Warsaw", "PL", 52.2297, 21.0122, ("warsaw", "warszawa", "poland", "krakow", "kraków", "wroclaw")),
    ("Prague", "CZ", 50.0755, 14.4378, ("prague", "praha", "czech")),
    ("Vienna", "AT", 48.2082, 16.3738, ("vienna", "wien", "austria")),
    ("Budapest", "HU", 47.4979, 19.0402, ("budapest", "hungary")),
    ("Bucharest", "RO", 44.4268, 26.1025, ("bucharest", "romania", "cluj")),
    ("Sofia", "BG", 42.6977, 23.3219, ("sofia", "bulgaria")),
    ("Athens", "GR", 37.9838, 23.7275, ("athens", "greece")),
    ("Belgrade", "RS", 44.7866, 20.4489, ("belgrade", "serbia", "novi sad")),
    ("Tallinn", "EE", 59.4370, 24.7536, ("tallinn", "estonia", "riga", "latvia", "vilnius", "lithuania")),
    ("Brussels", "BE", 50.8503, 4.3517, ("brussels", "belgium", "antwerp", "ghent")),
    ("Istanbul", "TR", 41.0082, 28.9784, ("istanbul", "turkey", "ankara")),
    ("Pristina", "XK", 42.6629, 21.1655, ("pristina", "prishtina", "kosovo")),

    # --- Africa and Latin America ---
    ("Lagos", "NG", 6.5244, 3.3792, ("lagos", "nigeria", "abuja")),
    ("Nairobi", "KE", -1.2921, 36.8219, ("nairobi", "kenya")),
    ("Cape Town", "ZA", -33.9249, 18.4241, ("cape town", "johannesburg", "south africa")),
    ("Cairo", "EG", 30.0444, 31.2357, ("cairo", "egypt")),
    ("São Paulo", "BR", -23.5505, -46.6333, ("são paulo", "sao paulo", "brazil", "rio de janeiro")),
    ("Buenos Aires", "AR", -34.6037, -58.3816, ("buenos aires", "argentina")),
    ("Bogotá", "CO", 4.7110, -74.0721, ("bogotá", "bogota", "colombia", "medellín", "medellin")),
    ("Santiago", "CL", -33.4489, -70.6693, ("santiago", "chile")),
    ("Lima", "PE", -12.0464, -77.0428, ("lima", "peru")),
)

# Country fallbacks, used when a posting names a country but no city.
COUNTRY_CENTROIDS: dict[str, tuple[str, float, float]] = {
    "india": ("India", 22.351, 78.667),
    "united states": ("United States", 39.5, -98.35),
    "usa": ("United States", 39.5, -98.35),
    "canada": ("Canada", 56.13, -106.35),
    "united kingdom": ("United Kingdom", 54.0, -2.0),
    "germany": ("Germany", 51.17, 10.45),
    "france": ("France", 46.6, 2.2),
    "spain": ("Spain", 40.46, -3.75),
    "australia": ("Australia", -25.27, 133.78),
    "japan": ("Japan", 36.2, 138.25),
    "brazil": ("Brazil", -14.24, -51.93),
    "poland": ("Poland", 51.92, 19.15),
    "ireland": ("Ireland", 53.41, -8.24),
    "netherlands": ("Netherlands", 52.13, 5.29),
}

_ENTRIES = [
    (label, country, lat, lon, tuple(sorted(aliases, key=len, reverse=True)))
    for label, country, lat, lon, aliases in GAZETTEER
]

# Word-boundary patterns, longest alias first, so "san jose" wins over "jose"
# and "new delhi" is never matched as plain "delhi" in a different city's name.
_ALIAS_PATTERNS: list[tuple[str, re.Pattern[str]]] = sorted(
    (
        (label, re.compile(rf"(?<![a-z]){re.escape(alias)}(?![a-z])", re.I))
        for label, _, _, _, aliases in _ENTRIES
        for alias in aliases
    ),
    key=lambda pair: -len(pair[1].pattern),
)

_BY_LABEL = {label: (label, country, lat, lon) for label, country, lat, lon, _ in _ENTRIES}


def locate(location: str) -> list[dict]:
    """Every place this location string names, as plottable points.

    Returns a list because postings routinely name several offices at once, and
    a job open in both Bengaluru and Gurugram belongs on the map twice.
    """
    if not location:
        return []

    text = re.sub(r"\s+", " ", location.lower())
    found: list[dict] = []
    seen: set[str] = set()

    for label, rx in _ALIAS_PATTERNS:
        if label in seen:
            continue
        if rx.search(text):
            seen.add(label)
            _, country, lat, lon = _BY_LABEL[label]
            found.append({"label": label, "country": country, "lat": lat, "lon": lon})

    if found:
        return found

    for needle, (label, lat, lon) in COUNTRY_CENTROIDS.items():
        if re.search(rf"(?<![a-z]){re.escape(needle)}(?![a-z])", text):
            return [{"label": label, "country": "", "lat": lat, "lon": lon, "approximate": True}]

    return []
