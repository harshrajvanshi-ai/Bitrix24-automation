const fs = require('fs');

const configData = {
  stageMapping: {
    enquiryStageId: "UC_BANHOE",
    enquiryStageName: "Enquiry Leads",
    listingStageId: "IN_PROCESS",
    listingStageName: "Listing Leads"
  },
  listingLayout: {
    title: "Listing Form Layout",
    sections: [
      {
        title: "📌 Commercial Terms & Listing Status",
        description: "Listing authority, commercial operation, price, and operational dates",
        fields: [
          {
            code: "UF_CRM_LISTING_TYPE",
            label: "Listing Agreement Type",
            type: "enumeration",
            options: ["Exclusive", "Non-Exclusive", "Sole Agency", "Open", "Pocket"],
            placeholder: "Select listing type"
          },
          {
            code: "UF_CRM_1791952650167",
            label: "Listing Operation",
            type: "enumeration",
            options: ["Sale", "Rent", "Off-Plan", "Commercial Sale", "Commercial Rent"],
            placeholder: "Select operation"
          },
          {
            code: "UF_CRM_1791952050535",
            label: "Property Category",
            type: "enumeration",
            options: ["Apartment", "Villa", "Townhouse", "Penthouse", "Duplex", "Land", "Commercial", "Office", "Retail"],
            placeholder: "Select category"
          },
          {
            code: "UF_CRM_LISTING_PRICE",
            label: "Asking / Listing Price (AED)",
            type: "money",
            placeholder: "e.g., 3,500,000"
          },
          {
            code: "UF_CRM_1791970832589",
            label: "Occupancy Status",
            type: "enumeration",
            options: ["Vacant on Transfer", "Owner Occupied", "Rented", "Under Notice", "Vacant"],
            placeholder: "Select occupancy status"
          },
          {
            code: "UF_CRM_AVAIL_DATE",
            label: "Available From Date",
            type: "date",
            placeholder: "YYYY-MM-DD"
          },
          {
            code: "UF_CRM_AVAILABLE_TO",
            label: "Available To Date",
            type: "date",
            placeholder: "YYYY-MM-DD"
          },
          {
            code: "UF_CRM_BANK_OWNED",
            label: "Bank Owned / Distressed Property",
            type: "boolean",
            placeholder: "Yes / Bank Owned"
          }
        ]
      },
      {
        title: "📐 Property Specifications & Dimensions",
        description: "Dimensions, rooms, spaces, furnishing, and property view",
        fields: [
          {
            code: "UF_CRM_BUA",
            label: "Built-up Area (BUA Sq. Ft.)",
            type: "number",
            placeholder: "e.g., 1450"
          },
          {
            code: "UF_CRM_PLOT_AREA",
            label: "Plot Area (Sq. Ft.)",
            type: "number",
            placeholder: "e.g., 2200"
          },
          {
            code: "UF_CRM_BEDROOMS",
            label: "Bedrooms",
            type: "enumeration",
            options: ["Studio", "1 BR", "2 BR", "3 BR", "4 BR", "5+ BR"],
            placeholder: "Select bedrooms"
          },
          {
            code: "UF_CRM_BATHROOMS",
            label: "Bathrooms",
            type: "number",
            placeholder: "e.g., 2"
          },
          {
            code: "UF_CRM_PARKING",
            label: "Parking Spaces",
            type: "number",
            placeholder: "e.g., 1"
          },
          {
            code: "UF_CRM_BASEMENT",
            label: "Basement Area (Sq. Ft.)",
            type: "number",
            placeholder: "e.g., 500"
          },
          {
            code: "UF_CRM_1791969936048",
            label: "Furnishing Status",
            type: "enumeration",
            options: ["Fully-Furnished", "Semi-Furnished", "Unfurnished"],
            placeholder: "Select furnishing"
          },
          {
            code: "UF_CRM_1791970130059",
            label: "Property View",
            type: "enumeration",
            options: ["Sea View", "Burj Khalifa View", "Marina View", "Palm View", "Golf Course View", "Pool View", "Garden View", "Park View", "City View", "Community View", "Street View", "Canal View"],
            placeholder: "Select property view"
          }
        ]
      },
      {
        title: "📍 Building, Tower & Regional Location",
        description: "Project, developer, tower, unit number, and portal geography",
        fields: [
          {
            code: "UF_CRM_PROJECT",
            label: "Master Project",
            type: "string",
            placeholder: "e.g., Downtown Dubai, Dubai Creek Harbour"
          },
          {
            code: "UF_CRM_DEVELOPER",
            label: "Developer",
            type: "string",
            placeholder: "e.g., Emaar Properties, Nakheel"
          },
          {
            code: "UF_CRM_BUILDING",
            label: "Building / Tower Name",
            type: "string",
            placeholder: "e.g., Burj Crown"
          },
          {
            code: "UF_CRM_UNIT_NO",
            label: "Unit Number",
            type: "string",
            placeholder: "e.g., 1402"
          },
          {
            code: "UF_CRM_PHASE",
            label: "Project Phase",
            type: "string",
            placeholder: "e.g., Phase 2"
          },
          {
            code: "UF_CRM_NEIGHBORHOOD",
            label: "Neighborhood",
            type: "string",
            placeholder: "e.g., Opera District"
          },
          {
            code: "UF_CRM_COMMUNITY",
            label: "Community / Sub-community",
            type: "string",
            placeholder: "e.g., Downtown Dubai"
          },
          {
            code: "UF_CRM_CITY",
            label: "City / Emirate",
            type: "string",
            placeholder: "e.g., Dubai"
          },
          {
            code: "UF_CRM_CITY_BAYUT",
            label: "City (Bayut Mapping)",
            type: "string",
            placeholder: "e.g., Dubai"
          },
          {
            code: "UF_CRM_CITY_PF",
            label: "City (Propertyfinder Mapping)",
            type: "string",
            placeholder: "e.g., Dubai"
          },
          {
            code: "UF_CRM_COUNTRY",
            label: "Country",
            type: "string",
            placeholder: "e.g., United Arab Emirates"
          }
        ]
      },
      {
        title: "🛡️ Compliance, Portal IDs & Verification",
        description: "RERA permit, portal listing IDs, online status, and public description",
        fields: [
          {
            code: "UF_CRM_RERA_PERMIT",
            label: "RERA / Trakheesi Permit No.",
            type: "string",
            placeholder: "e.g., 7112345678"
          },
          {
            code: "UF_CRM_TRAKHEESI_EXPIRY",
            label: "Trakheesi Permit Expiry Date",
            type: "date",
            placeholder: "YYYY-MM-DD"
          },
          {
            code: "UF_CRM_FORM_A_DATE",
            label: "Form A Signed Date",
            type: "date",
            placeholder: "YYYY-MM-DD"
          },
          {
            code: "UF_CRM_BAYUT_ID",
            label: "Bayut Listing ID",
            type: "string",
            placeholder: "e.g., bayut-998811"
          },
          {
            code: "UF_CRM_PF_ID",
            label: "Propertyfinder Listing ID",
            type: "string",
            placeholder: "e.g., pf-445522"
          },
          {
            code: "UF_CRM_DATE_ONLINE",
            label: "Date Made Online",
            type: "date",
            placeholder: "YYYY-MM-DD"
          },
          {
            code: "UF_CRM_DATE_OFFLINE",
            label: "Date Made Offline",
            type: "date",
            placeholder: "YYYY-MM-DD"
          },
          {
            code: "UF_CRM_1791970241624",
            label: "Property Currently Mortgaged",
            type: "boolean",
            placeholder: "Yes / Mortgaged"
          },
          {
            code: "UF_CRM_1791970897872",
            label: "Currently Tenant Occupied",
            type: "boolean",
            placeholder: "Yes / Tenant Occupied"
          },
          {
            code: "UF_CRM_DESCRIPTION",
            label: "Listing Public Description / Amenities",
            type: "text",
            placeholder: "Enter listing features, balcony, pool access, payment plans..."
          }
        ]
      }
    ]
  },
  enquiryLayout: {
    title: "Enquiry Form Layout",
    sections: [
      {
        title: "🎯 Client Profile, Channel & Deal Terms",
        description: "Target category, operational type, channel source, and deal value",
        fields: [
          {
            code: "UF_CRM_1791952050535",
            label: "Property Category",
            type: "enumeration",
            options: ["Apartment", "Villa", "Townhouse", "Penthouse", "Duplex", "Land", "Commercial", "Office", "Retail"],
            placeholder: "Select category"
          },
          {
            code: "UF_CRM_1791952650167",
            label: "Transaction Type",
            type: "enumeration",
            options: ["Rent", "Sale", "Off-Plan", "Commercial Sale", "Commercial Rent"],
            placeholder: "Select transaction type"
          },
          {
            code: "UF_CRM_1791542918927",
            label: "Client Intent",
            type: "enumeration",
            options: ["Buy", "Invest", "Sell", "Rent"],
            placeholder: "Select intent"
          },
          {
            code: "UF_CRM_LEAD_SOURCE",
            label: "Portal / Lead Source",
            type: "enumeration",
            options: ["Propertyfinder", "Bayut / Dubizzle", "Direct Website", "Referral / Agent", "Walk-in / Cold Call", "Social Media / Meta Ads"],
            placeholder: "Select lead source"
          },
          {
            code: "UF_CRM_1791962499457",
            label: "Lead Priority",
            type: "enumeration",
            options: ["HIGH", "MEDIUM", "LOW"],
            placeholder: "Select priority"
          },
          {
            code: "UF_CRM_DEAL_VALUE",
            label: "Expected Deal Value (AED)",
            type: "money",
            placeholder: "e.g., 2,800,000"
          },
          {
            code: "UF_CRM_WHATSAPP_RESP",
            label: "WhatsApp Response Received",
            type: "boolean",
            placeholder: "Yes / Client Responded"
          },
          {
            code: "UF_CRM_ENQUIRY_LOCKED",
            label: "Enquiry Locked / Assigned",
            type: "boolean",
            placeholder: "Yes / Locked"
          }
        ]
      },
      {
        title: "💰 Budget & Financial Criteria",
        description: "Financial range, rental cheques, and mortgage requirements",
        fields: [
          {
            code: "UF_CRM_BUDGET_MIN",
            label: "Budget Min (AED)",
            type: "money",
            placeholder: "e.g., 1,800,000"
          },
          {
            code: "UF_CRM_BUDGET_MAX",
            label: "Budget Max (AED)",
            type: "money",
            placeholder: "e.g., 2,500,000"
          },
          {
            code: "UF_CRM_CHEQUES",
            label: "Preferred Cheques (Rentals)",
            type: "enumeration",
            options: ["1 Cheque", "2 Cheques", "4 Cheques", "6 Cheques", "12 Cheques"],
            placeholder: "Select cheques"
          },
          {
            code: "UF_CRM_FINANCE_NEEDED",
            label: "Bank Mortgage / Financing Required",
            type: "boolean",
            placeholder: "Yes / Needs Mortgage Assistance"
          }
        ]
      },
      {
        title: "🛋️ Property Specifications & Architectural Criteria",
        description: "Bedrooms, bathrooms, size criteria, floor level, and desired style",
        fields: [
          {
            code: "UF_CRM_BEDS_MIN",
            label: "Bedrooms Min",
            type: "number",
            placeholder: "e.g., 1"
          },
          {
            code: "UF_CRM_BEDS_MAX",
            label: "Bedrooms Max",
            type: "number",
            placeholder: "e.g., 3"
          },
          {
            code: "UF_CRM_BATHS_MIN",
            label: "Bathrooms Min",
            type: "number",
            placeholder: "e.g., 2"
          },
          {
            code: "UF_CRM_BATHS_MAX",
            label: "Bathrooms Max",
            type: "number",
            placeholder: "e.g., 4"
          },
          {
            code: "UF_CRM_SIZE_MIN",
            label: "Size Min (Sq. Ft.)",
            type: "number",
            placeholder: "e.g., 900"
          },
          {
            code: "UF_CRM_SIZE_MAX",
            label: "Size Max (Sq. Ft.)",
            type: "number",
            placeholder: "e.g., 1800"
          },
          {
            code: "UF_CRM_PARKING_REQ",
            label: "Dedicated Parking Required",
            type: "boolean",
            placeholder: "Yes / Requires Parking"
          },
          {
            code: "UF_CRM_STORIES",
            label: "Preferred Stories / Floor Level",
            type: "number",
            placeholder: "e.g., High Floor / 2 Stories"
          },
          {
            code: "UF_CRM_STYLE",
            label: "Architectural Style Preference",
            type: "string",
            placeholder: "e.g., Modern, Contemporary, Mediterranean"
          },
          {
            code: "UF_CRM_BEACHFRONT",
            label: "Beachfront / Waterfront Preferred",
            type: "boolean",
            placeholder: "Yes / Beachfront"
          },
          {
            code: "UF_CRM_WATER_BODY",
            label: "Water Body / Specific View Preferred",
            type: "string",
            placeholder: "e.g., Canal, Marina, Open Sea, Lagoon"
          },
          {
            code: "UF_CRM_1791969936048",
            label: "Furnishing Preference",
            type: "enumeration",
            options: ["Fully-Furnished", "Semi-Furnished", "Unfurnished"],
            placeholder: "Select furnishing"
          },
          {
            code: "UF_CRM_1791970130059",
            label: "Desired View",
            type: "enumeration",
            options: ["Sea View", "Burj Khalifa View", "Marina View", "Palm View", "Golf Course View", "Pool View", "Garden View", "Park View", "City View", "Community View", "Street View", "Canal View"],
            placeholder: "Select view"
          }
        ]
      },
      {
        title: "🗺️ Location Preferences, Household & Timeline",
        description: "Target geographic areas, school proximity, household size, and move-in timeline",
        fields: [
          {
            code: "UF_CRM_PREFERRED_COMMUNITY",
            label: "Preferred Communities",
            type: "string",
            placeholder: "e.g., Downtown Dubai, Dubai Marina, Palm Jumeirah"
          },
          {
            code: "UF_CRM_PREFERRED_CITY",
            label: "Preferred City / Emirate",
            type: "string",
            placeholder: "e.g., Dubai"
          },
          {
            code: "UF_CRM_SCHOOL",
            label: "Nearby Schools / Education Preference",
            type: "string",
            placeholder: "e.g., GEMS Wellington, Kings School"
          },
          {
            code: "UF_CRM_HOUSEHOLD",
            label: "Household Members / Family Size",
            type: "string",
            placeholder: "e.g., Family with 2 kids"
          },
          {
            code: "UF_CRM_1791969030353",
            label: "Target Move-in / Handover Date",
            type: "date",
            placeholder: "YYYY-MM-DD"
          },
          {
            code: "UF_CRM_TIMEFRAME",
            label: "Buying / Renting Timeframe",
            type: "enumeration",
            options: ["Immediate (< 1 month)", "1 - 3 months", "3 - 6 months", "> 6 months / Investing"],
            placeholder: "Select timeframe"
          },
          {
            code: "UF_CRM_1791543453592",
            label: "Specific Client Notes & Criteria",
            type: "text",
            placeholder: "Enter detailed criteria, floor preference, pet-friendly requirements..."
          }
        ]
      }
    ]
  }
};

// Flatten listingFields and enquiryFields
configData.listingFields = [];
configData.listingLayout.sections.forEach(s => configData.listingFields.push(...s.fields));

configData.enquiryFields = [];
configData.enquiryLayout.sections.forEach(s => configData.enquiryFields.push(...s.fields));

fs.writeFileSync('config/fields.json', JSON.stringify(configData, null, 2), 'utf8');
console.log('Updated config/fields.json!');
console.log('Listing layout fields count:', configData.listingFields.length);
console.log('Enquiry layout fields count:', configData.enquiryFields.length);
