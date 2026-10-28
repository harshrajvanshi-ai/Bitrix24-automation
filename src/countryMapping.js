/**
 * Country Code Mapping & Resolution Utility
 * Maps country names, common aliases, and demonyms to ISO 3166-1 alpha-2 country codes.
 * Fallback condition: Returns empty string '' if no match is found.
 */

const COUNTRY_NAME_TO_CODE = {
  // Middle East & GCC
  'united arab emirates': 'AE',
  'uae': 'AE',
  'emirates': 'AE',
  'dubai': 'AE',
  'abu dhabi': 'AE',
  'sharjah': 'AE',
  'ajman': 'AE',
  'ras al khaimah': 'AE',
  'fujairah': 'AE',
  'umm al quwain': 'AE',
  'saudi arabia': 'SA',
  'ksa': 'SA',
  'kingdom of saudi arabia': 'SA',
  'qatar': 'QA',
  'doha': 'QA',
  'oman': 'OM',
  'muscat': 'OM',
  'kuwait': 'KW',
  'bahrain': 'BH',
  'manama': 'BH',
  'lebanon': 'LB',
  'beirut': 'LB',
  'jordan': 'JO',
  'amman': 'JO',
  'iraq': 'IQ',
  'baghdad': 'IQ',
  'iran': 'IR',
  'tehran': 'IR',
  'israel': 'IL',
  'tel aviv': 'IL',
  'jerusalem': 'IL',
  'yemen': 'YE',
  'syria': 'SY',
  'damascus': 'SY',

  // Europe & UK
  'united kingdom': 'GB',
  'uk': 'GB',
  'great britain': 'GB',
  'britain': 'GB',
  'england': 'GB',
  'scotland': 'GB',
  'wales': 'GB',
  'northern ireland': 'GB',
  'ireland': 'IE',
  'republic of ireland': 'IE',
  'france': 'FR',
  'paris': 'FR',
  'germany': 'DE',
  'deutschland': 'DE',
  'berlin': 'DE',
  'italy': 'IT',
  'italia': 'IT',
  'rome': 'IT',
  'spain': 'ES',
  'espana': 'ES',
  'españa': 'ES',
  'madrid': 'ES',
  'barcelona': 'ES',
  'portugal': 'PT',
  'lisbon': 'PT',
  'greece': 'GR',
  'athens': 'GR',
  'cyprus': 'CY',
  'switzerland': 'CH',
  'suisse': 'CH',
  'schweiz': 'CH',
  'geneva': 'CH',
  'zurich': 'CH',
  'austria': 'AT',
  'vienna': 'AT',
  'netherlands': 'NL',
  'holland': 'NL',
  'amsterdam': 'NL',
  'belgium': 'BE',
  'brussels': 'BE',
  'sweden': 'SE',
  'stockholm': 'SE',
  'norway': 'NO',
  'oslo': 'NO',
  'denmark': 'DK',
  'copenhagen': 'DK',
  'finland': 'FI',
  'helsinki': 'FI',
  'poland': 'PL',
  'warsaw': 'PL',
  'czech republic': 'CZ',
  'czechia': 'CZ',
  'prague': 'CZ',
  'hungary': 'HU',
  'budapest': 'HU',
  'romania': 'RO',
  'bulgaria': 'BG',
  'croatia': 'HR',
  'serbia': 'RS',
  'slovakia': 'SK',
  'slovenia': 'SI',
  'estonia': 'EE',
  'latvia': 'LV',
  'lithuania': 'LT',
  'luxembourg': 'LU',
  'monaco': 'MC',
  'malta': 'MT',
  'iceland': 'IS',

  // Americas
  'united states': 'US',
  'united states of america': 'US',
  'usa': 'US',
  'us': 'US',
  'america': 'US',
  'canada': 'CA',
  'mexico': 'MX',
  'brazil': 'BR',
  'brasil': 'BR',
  'argentina': 'AR',
  'colombia': 'CO',
  'chile': 'CL',
  'peru': 'PE',
  'uruguay': 'UY',
  'panama': 'PA',
  'costa rica': 'CR',
  'jamaica': 'JM',
  'bahamas': 'BS',
  'barbados': 'BB',
  'cayman islands': 'KY',
  'bermuda': 'BM',
  'british virgin islands': 'VG',

  // Asia & Oceania
  'india': 'IN',
  'bharat': 'IN',
  'pakistan': 'PK',
  'bangladesh': 'BD',
  'sri lanka': 'LK',
  'nepal': 'NP',
  'maldives': 'MV',
  'china': 'CN',
  'peoples republic of china': 'CN',
  'hong kong': 'HK',
  'macau': 'MO',
  'taiwan': 'TW',
  'singapore': 'SG',
  'malaysia': 'MY',
  'kuala lumpur': 'MY',
  'indonesia': 'ID',
  'jakarta': 'ID',
  'bali': 'ID',
  'thailand': 'TH',
  'bangkok': 'TH',
  'philippines': 'PH',
  'manila': 'PH',
  'vietnam': 'VN',
  'japan': 'JP',
  'tokyo': 'JP',
  'south korea': 'KR',
  'korea': 'KR',
  'seoul': 'KR',
  'australia': 'AU',
  'sydney': 'AU',
  'melbourne': 'AU',
  'new zealand': 'NZ',

  // Eurasia & CIS
  'russia': 'RU',
  'russian federation': 'RU',
  'moscow': 'RU',
  'ukraine': 'UA',
  'kyiv': 'UA',
  'kiev': 'UA',
  'turkey': 'TR',
  'turkiye': 'TR',
  'türkiye': 'TR',
  'istanbul': 'TR',
  'ankara': 'TR',
  'georgia': 'GE',
  'tbilisi': 'GE',
  'armenia': 'AM',
  'yerevan': 'AM',
  'azerbaijan': 'AZ',
  'baku': 'AZ',
  'kazakhstan': 'KZ',
  'astana': 'KZ',
  'almaty': 'KZ',
  'uzbekistan': 'UZ',
  'tashkent': 'UZ',

  // Africa
  'egypt': 'EG',
  'cairo': 'EG',
  'south africa': 'ZA',
  'johannesburg': 'ZA',
  'cape town': 'ZA',
  'nigeria': 'NG',
  'lagos': 'NG',
  'abuja': 'NG',
  'kenya': 'KE',
  'nairobi': 'KE',
  'morocco': 'MA',
  'casablanca': 'MA',
  'marrakech': 'MA',
  'tunisia': 'TN',
  'tunis': 'TN',
  'algeria': 'DZ',
  'algiers': 'DZ',
  'ethiopia': 'ET',
  'ghana': 'GH',
  'tanzania': 'TZ',
  'uganda': 'UG',
  'mauritius': 'MU',
  'seychelles': 'SC'
};

// Set of valid ISO-3166-1 alpha-2 codes
const VALID_ISO_CODES = new Set(Object.values(COUNTRY_NAME_TO_CODE));

/**
 * Resolve standard ISO 3166-1 alpha-2 country code from country name or alias.
 * Fallback condition: Returns empty string '' if no match found.
 * @param {string} countryName 
 * @returns {string} Two-letter uppercase ISO country code, or '' if no match.
 */
function resolveCountryCode(countryName) {
  if (!countryName) return '';
  const clean = String(countryName).trim();
  if (!clean) return '';

  const upper = clean.toUpperCase();
  // Direct match if already a valid 2-letter ISO code
  if (clean.length === 2 && VALID_ISO_CODES.has(upper)) {
    return upper;
  }

  // Normalized search: lowercase, remove punctuation, collapse whitespace
  const norm = clean.toLowerCase()
    .replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (COUNTRY_NAME_TO_CODE[norm]) {
    return COUNTRY_NAME_TO_CODE[norm];
  }

  // Check prefix match or exact word boundary match
  for (const [key, code] of Object.entries(COUNTRY_NAME_TO_CODE)) {
    if (norm === key || norm.startsWith(`${key} `) || norm.endsWith(` ${key}`)) {
      return code;
    }
  }

  // Fallback condition: return blank when no match found
  return '';
}

module.exports = {
  COUNTRY_NAME_TO_CODE,
  VALID_ISO_CODES,
  resolveCountryCode
};
