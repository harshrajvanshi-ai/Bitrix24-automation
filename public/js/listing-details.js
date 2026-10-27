/**
 * public/js/listing-details.js
 * Bitrix24 Listing Details Tab Engine for Listing Smart Process Automation (SPA 1058)
 * Minimalist, Compact & In-Window File Previews
 *
 * Capabilities:
 *  1. Automatic entity loading via Bitrix24 SDK or REST fallback
 *  2. 4 Dynamic Tailored Layouts driven strictly by UF_CRM_16_1790154808:
 *     - External Stock
 *     - Off-plan
 *     - Overseas Sale
 *     - Rent
 *  3. Precise field visibility matrix (show / opt / hide) and contextual labels
 *  4. In-Window Interactive Media & File Previews (rendered right in the page):
 *     - Inline image viewer viewport right in the card (no external tabs or windows)
 *     - Instant FileReader client previews for newly uploaded files before saving
 *     - Compact thumbnail strip with instant image swapping in the same window
 *     - Inline PDF & document viewer
 *  5. Dirty state tracking and Bitrix24 save normalization ({ fileData: [name, base64] })
 */

(function () {
  "use strict";

  // ============================================================================
  // 1. CONFIGURATION & LAYOUT SPECIFICATIONS
  // ============================================================================
  const CONFIG = {
    entityTypeId: 1058,
    placement: "CRM_DYNAMIC_1058_DETAIL_TAB",
    layoutField: "ufCrm16_1790154808",
    layoutFieldCrm: "UF_CRM_16_1790154808",

    // Mapping enum IDs & string labels to layout keys
    layoutEnumMap: {
      164: "external_stock",
      "external stock": "external_stock",
      162: "off_plan",
      "off-plan": "off_plan",
      "off-plan listing": "off_plan",
      160: "overseas_sale",
      "overseas sale": "overseas_sale",
      158: "rent",
      rent: "rent",
    },

    layoutMeta: {
      external_stock: {
        id: "external_stock",
        enumId: "164",
        title: "External Stock",
        icon: "🏢",
        pillClass: "layout-pill-external_stock",
      },
      off_plan: {
        id: "off_plan",
        enumId: "162",
        title: "Off-plan",
        icon: "🏗️",
        pillClass: "layout-pill-off_plan",
      },
      overseas_sale: {
        id: "overseas_sale",
        enumId: "160",
        title: "Overseas Sale",
        icon: "🌍",
        pillClass: "layout-pill-overseas_sale",
      },
      rent: {
        id: "rent",
        enumId: "158",
        title: "Rent",
        icon: "🔑",
        pillClass: "layout-pill-rent",
      },
    },

    // 8 Structured Sections according to User Specification synchronized with Listing SPA (1058 / CRM_16)
    sections: [
      {
        id: "general",
        title: "General Overview",
        icon: "📋",
        desc: "Title, stage, responsible person, and listing authority",
        fields: [
          {
            key: "title",
            crmCode: "TITLE",
            label: "Listing Title",
            type: "string",
            placeholder: "e.g. Luxury 4BR Penthouse in Downtown Dubai...",
            fullWidth: true,
            rules: {
              external_stock: "show",
              off_plan: "show",
              overseas_sale: "show",
              rent: "show",
            },
          },
          {
            key: "stageId",
            crmCode: "STAGE_ID",
            label: "Stage",
            type: "stage",
            options: [],
            rules: {
              external_stock: "show",
              off_plan: "show",
              overseas_sale: "show",
              rent: "show",
            },
          },
          {
            key: "assignedById",
            crmCode: "ASSIGNED_BY_ID",
            label: "Responsible Person",
            type: "user",
            rules: {
              external_stock: "show",
              off_plan: "show",
              overseas_sale: "show",
              rent: "show",
            },
          },
          {
            key: "ufCrm16_1790154808",
            crmCode: "UF_CRM_16_1790154808",
            label: "Listing Type",
            type: "enumeration",
            options: [
              { id: "164", value: "External Stock" },
              { id: "162", value: "Off-plan Listing" },
              { id: "160", value: "Overseas Sale" },
              { id: "158", value: "RENT" },
            ],
            rules: {
              external_stock: "show",
              off_plan: "show",
              overseas_sale: "show",
              rent: "show",
            },
          },
          {
            key: "ufCrm16Exclusive",
            crmCode: "UF_CRM_16_EXCLUSIVE",
            label: "Listing Agreement (Exclusive / Non-Exclusive)",
            type: "boolean",
            rules: {
              external_stock: "show",
              off_plan: "show",
              overseas_sale: "show",
              rent: "show",
            },
          },
          {
            key: "xmlId",
            crmCode: "XML_ID",
            label: "External ID (xmlId)",
            type: "string",
            placeholder: "e.g. EXT-984210",
            rules: {
              external_stock: "show",
              off_plan: "opt",
              overseas_sale: "opt",
              rent: "opt",
            },
          },
          {
            key: "ufCrm16ListingAgent",
            crmCode: "UF_CRM_16_PORTAL_LISTING_AGENT",
            label: "Listing Agent / Broker",
            type: "lookup",
            lookupEntity: "broker",
            placeholder: "Search Listing Agent...",
            rules: {
              external_stock: "show",
              off_plan: "show",
              overseas_sale: "show",
              rent: "show",
            },
          },
        ],
      },
      {
        id: "seller",
        title: "Seller & Source",
        icon: "🤝",
        desc: "Agency, developer, owner contacts, and master property relation",
        fields: [
          {
            key: "companyId",
            crmCode: "COMPANY_ID",
            fallbackKeys: ["mycompanyId", "ufCrm16_1791172932"],
            label: "Company (Agency or Developer)",
            type: "lookup",
            lookupEntity: "developer",
            placeholder: "Search Company or Developer...",
            rules: {
              external_stock: "show",
              off_plan: "show",
              overseas_sale: "show",
              rent: "show",
            },
          },
          {
            key: "contactId",
            crmCode: "CONTACT_ID",
            label: "Contact",
            type: "lookup",
            lookupEntity: "contact",
            placeholder: "Search Contact...",
            rules: {
              external_stock: "show",
              off_plan: "show",
              overseas_sale: "show",
              rent: "show",
            },
          },
          {
            key: "contactIds",
            crmCode: "CONTACT_IDS",
            label: "Contacts",
            type: "lookup",
            lookupEntity: "contact",
            placeholder: "Search Contacts...",
            rules: {
              external_stock: "show",
              off_plan: "show",
              overseas_sale: "show",
              rent: "show",
            },
          },
          {
            key: "parentId1052",
            crmCode: "PARENT_ID_1052",
            label: "Master Property (parentId1052)",
            type: "lookup",
            lookupEntity: "property",
            placeholder: "Search Master Property...",
            rules: {
              external_stock: "opt",
              off_plan: "show",
              overseas_sale: "opt",
              rent: "opt",
            },
          },
          {
            key: "ufCrm16DeveloperName",
            crmCode: "UF_CRM_16_DEVELOPER_NAME",
            fallbackKeys: ["ufCrm16Developer"],
            label: "Developer Name",
            type: "string",
            placeholder: "e.g. Emaar, Damac, Sobha...",
            rules: {
              external_stock: "opt",
              off_plan: "show",
              overseas_sale: "opt",
              rent: "opt",
            },
          },
          {
            key: "ufCrm16_1791172932",
            crmCode: "UF_CRM_16_1791172932",
            label: "Developer CRM Entity",
            type: "lookup",
            lookupEntity: "developer",
            placeholder: "Search Developer...",
            rules: {
              external_stock: "opt",
              off_plan: "show",
              overseas_sale: "opt",
              rent: "opt",
            },
          },
        ],
      },
      {
        id: "specs",
        title: "Property Specifications",
        icon: "📐",
        desc: "Dimensions, rooms, spaces, floor, and furnishing",
        fields: [
          {
            key: "ufCrm16PropertyType",
            crmCode: "UF_CRM_16_PROPERTY_TYPE",
            label: "Property Type",
            type: "enumeration",
            options: [
              { id: "886", value: "Apartment" },
              { id: "888", value: "Villa" },
              { id: "890", value: "Townhouse" },
              { id: "892", value: "Penthouse" },
              { id: "894", value: "Duplex" },
              { id: "896", value: "Land" },
              { id: "898", value: "Commercial" },
              { id: "900", value: "Office" },
              { id: "902", value: "Retail" },
            ],
            rules: {
              external_stock: "show",
              off_plan: "show",
              overseas_sale: "show",
              rent: "show",
            },
          },
          {
            key: "ufCrm16PropertySubType",
            crmCode: "UF_CRM_16_PROPERTY_SUB_TYPE",
            label: "Property Sub-type",
            type: "enumeration",
            options: [
              { id: "872", value: "Standard" },
              { id: "874", value: "Luxury" },
              { id: "876", value: "Ultra Luxury" },
              { id: "878", value: "Simplex" },
              { id: "880", value: "Duplex" },
              { id: "882", value: "Triplex" },
              { id: "884", value: "Penthouse" },
            ],
            rules: {
              external_stock: "show",
              off_plan: "show",
              overseas_sale: "show",
              rent: "show",
            },
          },
          {
            key: "ufCrm16_1791172802",
            crmCode: "UF_CRM_16_1791172802",
            label: "Bedrooms",
            type: "number",
            placeholder: "e.g. 3",
            rules: {
              external_stock: "show",
              off_plan: "show",
              overseas_sale: "show",
              rent: "show",
            },
          },
          {
            key: "ufCrm16_1791172787",
            crmCode: "UF_CRM_16_1791172787",
            label: "Bathrooms",
            type: "number",
            placeholder: "e.g. 4",
            rules: {
              external_stock: "show",
              off_plan: "show",
              overseas_sale: "show",
              rent: "show",
            },
          },
          {
            key: "ufCrm16SqFt",
            crmCode: "UF_CRM_16_SQ_FT",
            fallbackKeys: ["ufCrm16Size"],
            label: "Built-up Area (Sq Ft)",
            type: "number",
            addon: "Sq Ft",
            placeholder: "e.g. 2450",
            rules: {
              external_stock: "show",
              off_plan: "show",
              overseas_sale: "show",
              rent: "show",
            },
          },
          {
            key: "ufCrm16PlotSize",
            crmCode: "UF_CRM_16_PLOT_SIZE",
            fallbackKeys: ["ufCrm16LotSize"],
            label: "Plot Area (Sq Ft)",
            type: "number",
            addon: "Sq Ft",
            placeholder: "e.g. 4200",
            rules: {
              external_stock: "opt",
              off_plan: "opt",
              overseas_sale: "opt",
              rent: "opt",
            },
          },
          {
            key: "ufCrm16UnitNumber",
            crmCode: "UF_CRM_16_UNIT_NUMBER",
            label: "Unit Number",
            type: "string",
            placeholder: "e.g. 1402",
            rules: {
              external_stock: "show",
              off_plan: "show",
              overseas_sale: "opt",
              rent: "show",
            },
          },
          {
            key: "ufCrm16Floor",
            crmCode: "UF_CRM_16_FLOOR",
            label: "Floor Number",
            type: "integer",
            placeholder: "e.g. 14",
            rules: {
              external_stock: "show",
              off_plan: "show",
              overseas_sale: "opt",
              rent: "show",
            },
          },
          {
            key: "ufCrm16Furnished",
            crmCode: "UF_CRM_16_FURNISHED",
            label: "Furnished Status",
            type: "enumeration",
            options: [
              { id: "736", value: "Furnished" },
              { id: "738", value: "Semi-Furnished" },
              { id: "740", value: "Unfurnished" },
            ],
            rules: {
              external_stock: "opt",
              off_plan: "hide",
              overseas_sale: "opt",
              rent: "show",
            },
          },
          {
            key: "ufCrm16ParkingSpaces",
            crmCode: "UF_CRM_16_PARKING_SPACES",
            label: "Parking Spaces",
            type: "integer",
            placeholder: "e.g. 2",
            rules: {
              external_stock: "show",
              off_plan: "opt",
              overseas_sale: "opt",
              rent: "show",
            },
          },
          {
            key: "ufCrm16Layout",
            crmCode: "UF_CRM_16_LAYOUT",
            label: "Property Layout",
            type: "lookup",
            lookupEntity: "layout",
            placeholder: "Search Layout...",
            rules: {
              external_stock: "opt",
              off_plan: "show",
              overseas_sale: "opt",
              rent: "opt",
            },
          },
        ],
      },
      {
        id: "location",
        title: "Location & Geography",
        icon: "📍",
        desc: "Country, city, community, tower, and coordinates",
        fields: [
          {
            key: "ufCrm16ProjectName",
            crmCode: "UF_CRM_16_PROJECT_NAME",
            fallbackKeys: [
              "ufCrm16BuildingBayut",
              "ufCrm16_1791173131",
              "ufCrm16ProjectInfo",
            ],
            label: "Project / Building Name",
            type: "lookup",
            lookupEntity: "project",
            placeholder: "Search Project / Building...",
            rules: {
              external_stock: "show",
              off_plan: "show",
              overseas_sale: "opt",
              rent: "show",
            },
          },
          {
            key: "ufCrm16MasterProject",
            crmCode: "UF_CRM_16_MASTER_PROJECT",
            fallbackKeys: [
              "ufCrm16_1791173000",
              "ufCrm16MasterProjectInfo",
              "ufCrm16OldMasterProject",
            ],
            label: "Master Project",
            type: "lookup",
            lookupEntity: "master_project",
            placeholder: "Search Master Project...",
            rules: {
              external_stock: "opt",
              off_plan: "show",
              overseas_sale: "opt",
              rent: "opt",
            },
          },
          {
            key: "ufCrm16BuildingBayut",
            crmCode: "UF_CRM_16_BUILDING_BAYUT",
            label: "Building / Tower Name (Bayut)",
            type: "string",
            placeholder: "e.g. Tower A, East Wing...",
            rules: {
              external_stock: "show",
              off_plan: "show",
              overseas_sale: "opt",
              rent: "show",
            },
          },
          {
            key: "ufCrm16CommunityPropertyfinder",
            crmCode: "UF_CRM_16_COMMUNITY_PROPERTYFINDER",
            label: "Community - Propertyfinder",
            type: "string",
            placeholder: "e.g. Downtown Dubai, Palm Jumeirah...",
            rules: {
              external_stock: "show",
              off_plan: "show",
              overseas_sale: "opt",
              rent: "show",
            },
          },
          {
            key: "ufCrm16SubCommunityPropertyfinder",
            crmCode: "UF_CRM_16_SUB_COMMUNITY_PROPERTYFINDER",
            label: "Sub-Community",
            type: "string",
            placeholder: "e.g. Burj Crown, Marina Gate 2...",
            rules: {
              external_stock: "show",
              off_plan: "show",
              overseas_sale: "opt",
              rent: "show",
            },
          },
          {
            key: "ufCrm16_1791173032",
            crmCode: "UF_CRM_16_1791173032",
            fallbackKeys: [
              "ufCrm16CommunityPropertyfinder",
              "ufCrm16_1791172692",
              "ufCrm16SubCommunityPropertyfinder",
            ],
            label: "Neighborhood / Community",
            type: "string",
            placeholder: "e.g. Business Bay, Dubai Marina...",
            rules: {
              external_stock: "show",
              off_plan: "show",
              overseas_sale: "show",
              rent: "show",
            },
          },
          {
            key: "ufCrm16_1791172815",
            crmCode: "UF_CRM_16_1791172815",
            fallbackKeys: ["ufCrm16_1791172830", "ufCrm16_1791172841"],
            label: "City",
            type: "string",
            placeholder: "e.g. Dubai, London, Abu Dhabi...",
            rules: {
              external_stock: "show",
              off_plan: "show",
              overseas_sale: "show",
              rent: "show",
            },
          },
          {
            key: "ufCrm16_1791172854",
            crmCode: "UF_CRM_16_1791172854",
            fallbackKeys: ["ufCrm16CountryCode"],
            label: "Country",
            type: "string",
            placeholder: "e.g. United Arab Emirates, UK, France...",
            rules: {
              external_stock: "opt",
              off_plan: "opt",
              overseas_sale: "show",
              rent: "opt",
            },
          },
          {
            key: "ufCrm16Street",
            crmCode: "UF_CRM_16_STREET",
            fallbackKeys: ["ufCrm16DisplayAddress", "ufCrm16DisplayedAddress"],
            label: "Street",
            type: "string",
            placeholder: "e.g. Sheikh Mohammed bin Rashid Blvd...",
            rules: {
              external_stock: "show",
              off_plan: "show",
              overseas_sale: "show",
              rent: "show",
            },
          },
          {
            key: "ufCrm16_1791172676",
            crmCode: "UF_CRM_16_1791172676",
            label: "Address",
            type: "address",
            placeholder: "Street, building, unit number...",
            rules: {
              external_stock: "show",
              off_plan: "show",
              overseas_sale: "show",
              rent: "show",
            },
          },
          {
            key: "ufCrm16Latitude",
            crmCode: "UF_CRM_16_LATITUDE",
            label: "Latitude",
            type: "number",
            placeholder: "e.g. 25.1972",
            rules: {
              external_stock: "show",
              off_plan: "show",
              overseas_sale: "show",
              rent: "show",
            },
          },
          {
            key: "ufCrm16Longitude",
            crmCode: "UF_CRM_16_LONGITUDE",
            label: "Longitude",
            type: "number",
            placeholder: "e.g. 55.2744",
            rules: {
              external_stock: "show",
              off_plan: "show",
              overseas_sale: "show",
              rent: "show",
            },
          },
        ],
      },
      {
        id: "pricing",
        title: "Pricing & Terms",
        icon: "💰",
        desc: "Asking price, rent frequency, commission, and payment plans",
        fields: [
          {
            key: "ufCrm16_1790154936",
            crmCode: "UF_CRM_16_1790154936",
            fallbackKeys: ["ufCrm16Price", "ufCrm16YearlyRental"],
            label: "Listing Price (AED)",
            type: "money",
            addon: "AED",
            placeholder: "e.g. 2,500,000",
            rules: {
              external_stock: "show",
              off_plan: "show",
              overseas_sale: "show",
              rent: "show",
            },
            labelOverrides: {
              rent: "Listing Price (as annual rent)",
            },
          },
          {
            key: "ufCrm16ListPricePerSqFt",
            crmCode: "UF_CRM_16_LIST_PRICE_PER_SQ_FT",
            fallbackKeys: ["ufCrm16_1792611299625"],
            label: "Price Per Sq Ft",
            type: "money",
            addon: "AED/SqFt",
            placeholder: "e.g. 1,450",
            rules: {
              external_stock: "show",
              off_plan: "show",
              overseas_sale: "show",
              rent: "opt",
            },
          },
          {
            key: "ufCrm16BuyersAgentCommission",
            crmCode: "UF_CRM_16_BUYERS_AGENT_COMMISSION",
            label: "Agency Commission (%)",
            type: "number",
            addon: "%",
            placeholder: "e.g. 2.0",
            rules: {
              external_stock: "show",
              off_plan: "show",
              overseas_sale: "show",
              rent: "show",
            },
          },
          {
            key: "ufCrm16ServiceCharge",
            crmCode: "UF_CRM_16_SERVICE_CHARGE",
            label: "Service Charges (Annual)",
            type: "money",
            addon: "AED",
            placeholder: "e.g. 15,000",
            rules: {
              external_stock: "opt",
              off_plan: "opt",
              overseas_sale: "opt",
              rent: "opt",
            },
          },
          {
            key: "ufCrm16HoaFrequency",
            crmCode: "UF_CRM_16_HOA_FREQUENCY",
            label: "Rental Frequency",
            type: "enumeration",
            placeholder: "-- Select Rental Frequency --",
            options: [
              { id: "762", value: "Monthly" },
              { id: "764", value: "Quarterly" },
              { id: "766", value: "Semi-Annually" },
              { id: "768", value: "Annually" },
              { id: "770", value: "Included in Rent" },
              { id: "772", value: "None" },
            ],
            rules: {
              external_stock: "hide",
              off_plan: "hide",
              overseas_sale: "hide",
              rent: "show",
            },
          },
          {
            key: "ufCrm16PetDeposit",
            crmCode: "UF_CRM_16_PET_DEPOSIT",
            label: "Security Deposit (AED)",
            type: "money",
            addon: "AED",
            placeholder: "e.g. 10,000",
            rules: {
              external_stock: "hide",
              off_plan: "hide",
              overseas_sale: "hide",
              rent: "show",
            },
          },
          {
            key: "ufCrm16_1792127520",
            crmCode: "UF_CRM_16_1792127520",
            label: "Number of Cheques",
            type: "enumeration",
            options: [
              { id: "2432", value: "1 Cheque" },
              { id: "2434", value: "2 Cheque" },
              { id: "2436", value: "4 Cheque" },
              { id: "2438", value: "6 Cheque" },
              { id: "2440", value: "12 Cheque" },
            ],
            rules: {
              external_stock: "hide",
              off_plan: "opt",
              overseas_sale: "hide",
              rent: "show",
            },
            labelOverrides: {
              off_plan: "Number of Cheques (payment plan)",
            },
          },
        ],
      },
      {
        id: "dates",
        title: "Dates & Timeline",
        icon: "📅",
        desc: "Mandate duration, availability, and tenancy start/finish dates",
        fields: [
          {
            key: "begindate",
            crmCode: "BEGINDATE",
            label: "Started on",
            type: "date",
            rules: {
              external_stock: "show",
              off_plan: "opt",
              overseas_sale: "opt",
              rent: "show",
            },
            labelOverrides: {
              external_stock: "Started on (mandate period)",
              rent: "Started on (tenancy / availability)",
            },
          },
          {
            key: "closedate",
            crmCode: "CLOSEDATE",
            label: "Finished on",
            type: "date",
            rules: {
              external_stock: "show",
              off_plan: "opt",
              overseas_sale: "opt",
              rent: "show",
            },
            labelOverrides: {
              external_stock: "Finished on (mandate period)",
              rent: "Finished on (tenancy / availability)",
            },
          },
          {
            key: "ufCrm16_1790155057",
            crmCode: "UF_CRM_16_1790155057",
            label: "Available From",
            type: "date",
            rules: {
              external_stock: "show",
              off_plan: "show",
              overseas_sale: "show",
              rent: "show",
            },
          },
          {
            key: "ufCrm16CompletionDate",
            crmCode: "UF_CRM_16_COMPLETION_DATE",
            label: "Handover / Completion Date",
            type: "date",
            rules: {
              external_stock: "hide",
              off_plan: "show",
              overseas_sale: "opt",
              rent: "hide",
            },
          },
          {
            key: "ufCrm16CompletionStatus",
            crmCode: "UF_CRM_16_COMPLETION_STATUS",
            label: "Completion Status",
            type: "enumeration",
            options: [
              { id: "702", value: "Off-Plan" },
              { id: "704", value: "Under Construction" },
              { id: "706", value: "Completed" },
              { id: "708", value: "Handover" },
              { id: "710", value: "Ready" },
            ],
            rules: {
              external_stock: "hide",
              off_plan: "show",
              overseas_sale: "opt",
              rent: "hide",
            },
          },
          {
            key: "ufCrm16Occupancy",
            crmCode: "UF_CRM_16_OCCUPANCY",
            label: "Tenancy Status",
            type: "enumeration",
            options: [
              { id: "836", value: "Vacant on Transfer" },
              { id: "838", value: "Owner Occupied" },
              { id: "840", value: "Rented" },
              { id: "842", value: "Under Notice" },
              { id: "844", value: "Vacant" },
            ],
            rules: {
              external_stock: "opt",
              off_plan: "hide",
              overseas_sale: "opt",
              rent: "show",
            },
          },
          {
            key: "ufCrm16ExpirationDate",
            crmCode: "UF_CRM_16_EXPIRATION_DATE",
            label: "Tenancy End / Mandate Expiry Date",
            type: "date",
            rules: {
              external_stock: "opt",
              off_plan: "hide",
              overseas_sale: "opt",
              rent: "show",
            },
          },
        ],
      },
      {
        id: "marketing",
        title: "Portals & Marketing",
        icon: "🚀",
        desc: "Bayut, Propertyfinder, Dubizzle IDs, feed toggles, RERA permit, and descriptions",
        fields: [
          {
            key: "ufCrm16ReraPermitNumber",
            crmCode: "UF_CRM_16_RERA_PERMIT_NUMBER",
            label: "RERA Permit Number",
            type: "string",
            placeholder: "e.g. 7114829100",
            rules: {
              external_stock: "opt",
              off_plan: "show",
              overseas_sale: "hide",
              rent: "show",
            },
          },
          {
            key: "ufCrm16_1791787455285",
            crmCode: "UF_CRM_16_1791787455285",
            fallbackKeys: [
              "ufCrm16DtcmPermitNumber",
              "ufCrm16ReraPermitNumber",
            ],
            label: "Trakheesi Permit No",
            type: "string",
            placeholder: "e.g. TRK-982145",
            rules: {
              external_stock: "opt",
              off_plan: "show",
              overseas_sale: "hide",
              rent: "show",
            },
          },
          {
            key: "ufCrm16_1791787502111",
            crmCode: "UF_CRM_16_1791787502111",
            fallbackKeys: ["ufCrm16FormAExpiryDate"],
            label: "Trakheesi Permit Expiry Date",
            type: "date",
            rules: {
              external_stock: "opt",
              off_plan: "show",
              overseas_sale: "hide",
              rent: "show",
            },
          },
          {
            key: "ufCrm16QrCodeLink",
            crmCode: "UF_CRM_16_QR_CODE_LINK",
            fallbackKeys: ["ufCrm16QrCode"],
            label: "DLD QR / Permit URL",
            type: "url",
            placeholder: "https://dubailand.gov.ae/en/eservices/licensing/...",
            rules: {
              external_stock: "opt",
              off_plan: "show",
              overseas_sale: "hide",
              rent: "show",
            },
          },
          {
            key: "ufCrm16_1790155092",
            crmCode: "UF_CRM_16_1790155092",
            label: "Bayut Listing ID",
            type: "string",
            placeholder: "e.g. BYT-481902",
            rules: {
              external_stock: "opt",
              off_plan: "show",
              overseas_sale: "hide",
              rent: "show",
            },
          },
          {
            key: "ufCrm16PropertyFinderListingId",
            crmCode: "UF_CRM_16_PROPERTY_FINDER_LISTING_ID",
            label: "Propertyfinder Listing ID",
            type: "string",
            placeholder: "e.g. PF-981273",
            rules: {
              external_stock: "opt",
              off_plan: "show",
              overseas_sale: "hide",
              rent: "show",
            },
          },
          {
            key: "ufCrm16DubizzleRegion",
            crmCode: "UF_CRM_16_DUBIZZLE_REGION",
            fallbackKeys: [
              "ufCrm16LocationtextBayut",
              "ufCrm16PropertyfinderRegion",
            ],
            label: "Dubizzle Listing ID / Region",
            type: "string",
            placeholder: "e.g. DBZ-558291",
            rules: {
              external_stock: "opt",
              off_plan: "show",
              overseas_sale: "hide",
              rent: "show",
            },
          },
          {
            key: "ufCrm16SystemAllowedForPortals",
            crmCode: "UF_CRM_16_SYSTEM_ALLOWED_FOR_PORTALS",
            label: "Bayut / Dubizzle Feed Toggle",
            type: "boolean",
            rules: {
              external_stock: "opt",
              off_plan: "show",
              overseas_sale: "hide",
              rent: "show",
            },
          },
          {
            key: "ufCrm16SummaryDescription",
            crmCode: "UF_CRM_16_SUMMARY_DESCRIPTION",
            fallbackKeys: ["ufCrm16Summary", "ufCrm16Combinedtitle", "title"],
            label: "Portal Title",
            type: "string",
            placeholder: "SEO Headline for Portals...",
            fullWidth: true,
            rules: {
              external_stock: "opt",
              off_plan: "show",
              overseas_sale: "opt",
              rent: "show",
            },
          },
          {
            key: "ufCrm16Description",
            crmCode: "UF_CRM_16_DESCRIPTION",
            fallbackKeys: [
              "ufCrm16DescriptionIntroText",
              "ufCrm16DescriptionAuto",
              "sourceDescription",
            ],
            label: "Portal Description",
            type: "textarea",
            placeholder: "Marketing description, key amenities...",
            fullWidth: true,
            rules: {
              external_stock: "opt",
              off_plan: "show",
              overseas_sale: "opt",
              rent: "show",
            },
          },
          {
            key: "ufCrm16Listing",
            crmCode: "UF_CRM_16_LISTING",
            label: "Linked Portal Listing",
            type: "lookup",
            lookupEntity: "listing",
            placeholder: "Search Listing...",
            rules: {
              external_stock: "opt",
              off_plan: "opt",
              overseas_sale: "opt",
              rent: "opt",
            },
          },
        ],
      },
      {
        id: "media",
        title: "Media & Documents",
        icon: "📸",
        desc: "Primary image, photo gallery, documents, title deed, Form A, and RERA QR code",
        fields: [
          {
            key: "ufCrm16_1791173118",
            crmCode: "UF_CRM_16_1791173118",
            label: "Primary Image",
            type: "file",
            isImage: true,
            rules: {
              external_stock: "show",
              off_plan: "show",
              overseas_sale: "show",
              rent: "show",
            },
          },
          {
            key: "ufCrm16_1791881642219",
            crmCode: "UF_CRM_16_1791881642219",
            fallbackKeys: ["ufCrm16_1791544736052"],
            label: "Photos",
            type: "file",
            isImage: true,
            isMultiple: true,
            rules: {
              external_stock: "show",
              off_plan: "show",
              overseas_sale: "show",
              rent: "show",
            },
          },
          {
            key: "ufCrm16_1791881665252",
            crmCode: "UF_CRM_16_1791881665252",
            fallbackKeys: ["ufCrm16_1791172957"],
            label: "Documents",
            type: "file",
            isDoc: true,
            isMultiple: true,
            rules: {
              external_stock: "show",
              off_plan: "show",
              overseas_sale: "show",
              rent: "show",
            },
          },
          {
            key: "ufCrm16TitleDeed",
            crmCode: "UF_CRM_16_TITLE_DEED",
            label: "Title Deed",
            type: "file",
            isDoc: true,
            rules: {
              external_stock: "show",
              off_plan: "opt",
              overseas_sale: "show",
              rent: "opt",
            },
          },
          {
            key: "ufCrm16_1791787381785",
            crmCode: "UF_CRM_16_1791787381785",
            label: "Form A Document",
            type: "file",
            isDoc: true,
            rules: {
              external_stock: "show",
              off_plan: "opt",
              overseas_sale: "opt",
              rent: "show",
            },
          },
          {
            key: "ufCrm16QrCode",
            crmCode: "UF_CRM_16_QR_CODE",
            label: "QR Code",
            type: "file",
            isImage: true,
            rules: {
              external_stock: "show",
              off_plan: "show",
              overseas_sale: "show",
              rent: "show",
            },
          },
        ],
      },
    ],
  };

  // State Management
  let currentListingId = null;
  let currentListing = {};
  let currentLayout = "rent"; // Driven strictly by ufCrm16_1790154808
  let initialFormValues = {};
  let pendingFileUploads = {}; // fieldKey -> Array of { file, dataUrl, name, size }
  let removedFileIds = {}; // fieldKey -> Set of removed file IDs
  let isDirty = false;
  let allSectionsCollapsed = false;

  // DOM Elements
  const loadingEl = document.getElementById("loading");
  const contentEl = document.getElementById("content");
  const formEl = document.getElementById("listing-details-form");
  const sectionsContainer = document.getElementById("sections-container");
  const layoutModeBadge = document.getElementById("layout-mode-badge");
  const fieldsCountBadge = document.getElementById("fields-count-badge");
  const searchInput = document.getElementById("field-search-input");
  const clearSearchBtn = document.getElementById("btn-clear-search");
  const toggleAllBtn = document.getElementById("btn-toggle-all");
  const refreshBtn = document.getElementById("btn-refresh");
  const sectionNavPills = document.getElementById("section-nav-pills");
  const saveBtn = document.getElementById("btn-save");
  const cancelBtn = document.getElementById("btn-cancel");
  const dirtyIndicator = document.getElementById("dirty-indicator");
  const dirtyText = document.getElementById("dirty-text");

  // Lightbox Modal Elements (Premium Gallery Viewer)
  const lightboxModal = document.getElementById("lightbox-modal");
  const lightboxTitle = document.getElementById("lightbox-title");
  const lightboxFileIcon = document.getElementById("lightbox-file-icon");
  const lightboxCounter = document.getElementById("lightbox-counter");
  const lightboxBody = document.getElementById("lightbox-body");
  const lightboxDownloadLink = document.getElementById(
    "lightbox-download-link",
  );
  const lightboxCloseBtn = document.getElementById("lightbox-close-btn");
  const lbNavPrev = document.getElementById("lb-nav-prev");
  const lbNavNext = document.getElementById("lb-nav-next");
  const lbFilmstrip = document.getElementById("lb-filmstrip");
  const lbZoomControls = document.getElementById("lb-zoom-controls");

  // ============================================================================
  // 2. HELPER & UTILITY FUNCTIONS
  // ============================================================================
  function showToast(message, type = "info") {
    const container = document.getElementById("toast-container");
    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = "0";
      setTimeout(() => toast.remove(), 250);
    }, 3500);
  }

  function isEmbeddedInCrm() {
    try {
      return window.self !== window.top;
    } catch (_) {
      // Cross-origin iframe throwing SecurityError means it IS embedded in parent Bitrix24
      return true;
    }
  }

  function renderCrmLockoutScreen() {
    document.documentElement.classList.add("crm-lockout-active");
    const shield = document.getElementById("crm-lockout-shield");
    if (shield) shield.style.display = "flex";
    if (loadingEl) loadingEl.style.display = "none";
    if (contentEl) contentEl.style.display = "none";
  }

  function getCrmAuthHeaders() {
    const headers = {
      "X-Requested-With": "Bitrix24-CRM-App",
    };
    if (window.BX24 && typeof window.BX24.getAuth === "function") {
      const auth = window.BX24.getAuth();
      if (auth && auth.access_token) {
        headers["X-Bitrix-Auth"] = auth.access_token;
        headers["X-Bitrix-Domain"] = auth.domain || "csl.bitrix24.com";
      }
    }
    return headers;
  }

  let resizeTimer = null;
  function scheduleResize(delay = 60) {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      resizeWindow();
    }, delay);
  }

  function resizeWindow() {
    if (window.BX24 && typeof window.BX24.fitWindow === "function") {
      window.BX24.fitWindow();
    }
    try {
      const h = Math.max(
        document.body.scrollHeight,
        document.documentElement.scrollHeight,
        document.body.offsetHeight,
        document.documentElement.offsetHeight,
      );
      if (window.BX24 && typeof window.BX24.resizeWindow === "function") {
        window.BX24.resizeWindow(null, h + 30);
      }
    } catch (_) {}
  }

  if (typeof ResizeObserver !== "undefined") {
    try {
      const ro = new ResizeObserver(() => {
        scheduleResize(50);
      });
      ro.observe(document.body);
    } catch (_) {}
  }

  window.addEventListener("load", () => scheduleResize(100));

  function setDirty(state) {
    isDirty = state;
    if (dirtyIndicator) {
      dirtyIndicator.style.display = state ? "inline-flex" : "none";
      const pendingCount = Object.values(pendingFileUploads).reduce(
        (acc, arr) => acc + arr.length,
        0,
      );
      dirtyText.textContent =
        pendingCount > 0
          ? `Unsaved (${pendingCount} new files)`
          : "Unsaved changes";
    }
    if (cancelBtn) {
      cancelBtn.style.display = state ? "inline-flex" : "none";
    }
  }

  function resolveListingId() {
    if (window.BX24 && typeof window.BX24.placement === "object") {
      const placementInfo = window.BX24.placement.info();
      const options = placementInfo?.options;
      if (options) {
        if (typeof options === "string") {
          try {
            const parsed = JSON.parse(options);
            return parsed.ID || parsed.id || parsed.ENTITY_ID;
          } catch (e) {}
        } else if (typeof options === "object") {
          return options.ID || options.id || options.ENTITY_ID;
        }
      }
    }

    const urlParams = new URLSearchParams(window.location.search);
    return (
      urlParams.get("ID") ||
      urlParams.get("id") ||
      urlParams.get("listingId") ||
      "108"
    );
  }

  // Detects the layout strictly from the listing entity field
  function detectLayoutFromListing(listing) {
    const rawVal =
      listing?.[CONFIG.layoutField] || listing?.[CONFIG.layoutFieldCrm];
    if (!rawVal) return "rent"; // default

    const strVal = String(rawVal).toLowerCase().trim();
    if (CONFIG.layoutEnumMap[strVal]) {
      return CONFIG.layoutEnumMap[strVal];
    }
    return "rent";
  }

  // ============================================================================
  // 3. API DATA FETCHING & SAVING
  // ============================================================================
  function fetchListing(listingId) {
    return new Promise((resolve, reject) => {
      if (!isEmbeddedInCrm()) {
        renderCrmLockoutScreen();
        return reject(
          new Error("Application is only accessible within Bitrix24 CRM"),
        );
      }

      if (!window.BX24) {
        fetch(`/api/listing/${listingId}`, {
          headers: getCrmAuthHeaders(),
        })
          .then((r) => r.json())
          .then((data) => {
            if (data.success && data.item) resolve(data.item);
            else reject(new Error(data.error || "Failed to fetch listing"));
          })
          .catch(reject);
        return;
      }

      const bxPromise = new Promise((resBx) => {
        window.BX24.callMethod(
          "crm.item.get",
          {
            entityTypeId: CONFIG.entityTypeId,
            id: listingId,
          },
          (res) => {
            if (!res.error()) resBx(res.data()?.item || res.data());
            else resBx(null);
          },
        );
      });

      const apiPromise = fetch(`/api/listing/${listingId}`, {
        headers: getCrmAuthHeaders(),
      })
        .then((r) => r.json())
        .then((data) => (data.success && data.item ? data.item : null))
        .catch(() => null);

      Promise.all([bxPromise, apiPromise])
        .then(([bxItem, apiItem]) => {
          const item = bxItem || apiItem;
          if (!item) {
            return reject(new Error("Failed to fetch listing"));
          }
          if (apiItem) {
            for (const [k, v] of Object.entries(apiItem)) {
              if (
                Array.isArray(v) &&
                v.length > 0 &&
                v[0] &&
                (v[0].name || v[0].urlMachine)
              ) {
                item[k] = v;
              } else if (
                v &&
                typeof v === "object" &&
                (v.name || v.urlMachine)
              ) {
                item[k] = v;
              }
            }
          }
          resolve(item);
        })
        .catch(reject);
    });
  }

  function updateListing(listingId, fieldsPayload) {
    return new Promise((resolve, reject) => {
      if (!isEmbeddedInCrm()) {
        renderCrmLockoutScreen();
        return reject(
          new Error("Application is only accessible within Bitrix24 CRM"),
        );
      }

      if (!window.BX24) {
        fetch(`/api/listing/${listingId}/update`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...getCrmAuthHeaders(),
          },
          body: JSON.stringify({ fields: fieldsPayload }),
        })
          .then((r) => r.json())
          .then((data) => {
            if (data.success) resolve(data.item);
            else reject(new Error(data.error || "Update failed"));
          })
          .catch(reject);
        return;
      }

      window.BX24.callMethod(
        "crm.item.update",
        {
          entityTypeId: CONFIG.entityTypeId,
          id: listingId,
          fields: fieldsPayload,
        },
        (res) => {
          if (res.error()) {
            reject(new Error(res.error().toString()));
          } else {
            resolve(res.data()?.item || res.data());
          }
        },
      );
    });
  }

  const stageOptionsByPipeline = {};

  function fetchStageOptions(pipelineId) {
    const pId =
      pipelineId !== undefined && pipelineId !== null ? pipelineId : 22;
    const cacheKey = `pipe_${pId}`;
    return new Promise((resolve) => {
      if (
        stageOptionsByPipeline[cacheKey] &&
        stageOptionsByPipeline[cacheKey].length > 0
      ) {
        resolve(stageOptionsByPipeline[cacheKey]);
        return;
      }

      const targetEntityId = `DYNAMIC_1058_STAGE_${pId}`;
      const targetFallbackEntityId = `DYNAMIC_16_STAGE_${pId}`;

      function processResults(list) {
        if (!Array.isArray(list)) return [];
        // Strictly filter by ENTITY_ID matching the current pipeline so NO unrelated CRM dictionary items are included!
        const filtered = list.filter(
          (s) =>
            s &&
            (s.ENTITY_ID === targetEntityId ||
              s.ENTITY_ID === targetFallbackEntityId ||
              (s.CATEGORY_ID !== undefined &&
                String(s.CATEGORY_ID) === String(pId) &&
                String(s.ENTITY_ID).startsWith("DYNAMIC_"))),
        );
        return filtered.map((s) => ({
          id: s.STATUS_ID,
          value: s.NAME || s.STATUS_ID,
        }));
      }

      if (window.BX24) {
        window.BX24.callMethod(
          "crm.status.list",
          {
            filter: { ENTITY_ID: targetEntityId },
            order: { SORT: "ASC" },
          },
          (res) => {
            let opts = [];
            if (!res.error() && Array.isArray(res.data())) {
              opts = processResults(res.data());
            }
            if (opts.length > 0) {
              stageOptionsByPipeline[cacheKey] = opts;
              resolve(opts);
            } else {
              // Fallback to DYNAMIC_16_STAGE_{pId}
              window.BX24.callMethod(
                "crm.status.list",
                {
                  filter: { ENTITY_ID: targetFallbackEntityId },
                  order: { SORT: "ASC" },
                },
                (res2) => {
                  let opts2 = [];
                  if (!res2.error() && Array.isArray(res2.data())) {
                    opts2 = processResults(res2.data());
                  }
                  if (opts2.length > 0) {
                    stageOptionsByPipeline[cacheKey] = opts2;
                    resolve(opts2);
                  } else {
                    fetchFallbackStages(pId, resolve);
                  }
                },
              );
            }
          },
        );
      } else {
        fetchFallbackStages(pId, resolve);
      }
    });
  }

  function fetchFallbackStages(pipelineId, resolve) {
    fetch(`/api/stages/listing?categoryId=${pipelineId}`, {
      headers: getCrmAuthHeaders(),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.success && Array.isArray(data.stages)) {
          stageOptionsByPipeline[`pipe_${pipelineId}`] = data.stages;
          resolve(data.stages);
        } else {
          resolve([]);
        }
      })
      .catch(() => resolve([]));
  }

  // ============================================================================
  // ============================================================================
  // 4. LIGHTBOX — Premium Gallery Viewer (In-Window)
  // ============================================================================
  let lightboxCleanup = null;
  let _lbGallery = []; // array of { url, name, isImage, isPdf }
  let _lbIndex = 0; // current index within gallery
  let _lbScale = 1; // current zoom scale
  let _lbImgX = 0;
  let _lbImgY = 0;

  // Bitrix attachment URLs are frequently protected from the app iframe by
  // browser cookie/frame rules. Keep the original URL for Bitrix's native
  // viewer, but use our same-origin proxy for rendering and downloading.
  function getPreviewUrl(url) {
    if (!url || url.startsWith("data:") || url.includes("/api/file/proxy?url="))
      return url;
    return /^https?:\/\//i.test(url)
      ? `/api/file/proxy?url=${encodeURIComponent(url)}`
      : url;
  }

  function getNativeFileUrl(url) {
    const marker = "/api/file/proxy?url=";
    if (!url || !url.includes(marker)) return url;
    try {
      return decodeURIComponent(url.slice(url.indexOf(marker) + marker.length));
    } catch (_) {
      return url;
    }
  }

  function openInBitrixViewer(url) {
    const nativeUrl = getNativeFileUrl(url);
    if (!nativeUrl) return;
    if (
      window.BX24 &&
      typeof window.BX24.openPath === "function" &&
      !nativeUrl.startsWith("data:")
    ) {
      window.BX24.openPath(nativeUrl);
      return;
    }
    window.open(nativeUrl, "_blank", "noopener");
  }

  function _lbSetCounter() {
    if (_lbGallery.length > 1) {
      lightboxCounter.textContent = `${_lbIndex + 1} / ${_lbGallery.length}`;
      lightboxCounter.style.display = "";
    } else {
      lightboxCounter.style.display = "none";
    }
  }

  function _lbSetNavState() {
    const multi = _lbGallery.length > 1;
    lbNavPrev.style.display = multi ? "flex" : "none";
    lbNavNext.style.display = multi ? "flex" : "none";
    lbNavPrev.disabled = _lbIndex === 0;
    lbNavNext.disabled = _lbIndex === _lbGallery.length - 1;
  }

  function _lbSyncFilmstrip() {
    lbFilmstrip.querySelectorAll(".lb-film-item").forEach((el, i) => {
      el.classList.toggle("active", i === _lbIndex);
    });
    const activeEl = lbFilmstrip.querySelectorAll(".lb-film-item")[_lbIndex];
    if (activeEl)
      activeEl.scrollIntoView({
        behavior: "smooth",
        inline: "center",
        block: "nearest",
      });
  }

  function _lbBuildFilmstrip(gallery) {
    lbFilmstrip.innerHTML = "";
    if (gallery.length <= 1) {
      lbFilmstrip.style.display = "none";
      return;
    }
    lbFilmstrip.style.display = "flex";
    gallery.forEach((item, i) => {
      const el = document.createElement("div");
      el.className = "lb-film-item" + (i === _lbIndex ? " active" : "");
      if (item.isImage) {
        const filmImg = document.createElement("img");
        filmImg.src = item.url;
        filmImg.alt = item.name;
        filmImg.loading = "lazy";
        filmImg.onerror = function () {
          if (
            !this.dataset.proxied &&
            item.url &&
            item.url.startsWith("http")
          ) {
            this.dataset.proxied = "1";
            this.src = `/api/file/proxy?url=${encodeURIComponent(item.url)}`;
          }
        };
        el.appendChild(filmImg);
      } else {
        const badgeClass = item.isPdf ? "pdf" : "doc";
        const icon = item.isPdf ? "📄" : "📎";
        el.innerHTML = `
          <div class="lb-film-item-doc">
            <span>${icon}</span>
            <span class="lb-film-badge ${badgeClass}">${item.isPdf ? "PDF" : "DOC"}</span>
          </div>
        `;
      }
      el.addEventListener("click", () => _lbGoTo(i));
      lbFilmstrip.appendChild(el);
    });
  }

  function _lbGoTo(idx) {
    if (idx < 0 || idx >= _lbGallery.length) return;
    _lbIndex = idx;
    _lbScale = 1;
    _lbImgX = 0;
    _lbImgY = 0;
    _lbRenderCurrent();
    _lbSetCounter();
    _lbSetNavState();
    _lbSyncFilmstrip();
  }

  function _lbRenderCurrent() {
    if (lightboxCleanup) {
      lightboxCleanup();
      lightboxCleanup = null;
    }

    // Clear only the main content (keep nav buttons, hints, zoom controls)
    const existingImg = lightboxBody.querySelector(".lightbox-img");
    const existingIframe = lightboxBody.querySelector(".lightbox-iframe");
    const existingError = lightboxBody.querySelector(".lb-error-box");
    if (existingImg) existingImg.remove();
    if (existingIframe) existingIframe.remove();
    if (existingError) existingError.remove();

    const item = _lbGallery[_lbIndex];
    lightboxTitle.textContent = item.name || "Preview";
    lightboxDownloadLink.href = getPreviewUrl(item.url);
    lightboxDownloadLink.setAttribute("download", item.name || "download");

    const zoomToggleBtn = document.getElementById("lightbox-zoom-toggle-btn");

    if (item.isPdf) {
      if (lightboxFileIcon) lightboxFileIcon.textContent = "📄";
      if (zoomToggleBtn) zoomToggleBtn.style.display = "none";
      if (lbZoomControls) lbZoomControls.style.display = "none";

      const proxyUrl = getPreviewUrl(item.url);

      const iframe = document.createElement("iframe");
      iframe.className = "lightbox-iframe";
      iframe.src = proxyUrl;
      lightboxBody.appendChild(iframe);
    } else if (item.isImage) {
      // Image
      if (lightboxFileIcon) lightboxFileIcon.textContent = "🖼️";
      if (lbZoomControls) lbZoomControls.style.display = "flex";

      if (zoomToggleBtn) {
        zoomToggleBtn.style.display = "inline-flex";
        zoomToggleBtn.classList.remove("active");
        zoomToggleBtn.title = "Fit to Screen / 1:1 Size";
      }

      _lbScale = 1;
      _lbImgX = 0;
      _lbImgY = 0;
      let isDragging = false;
      let dragStartX = 0;
      let dragStartY = 0;
      let hasDragged = false;

      const img = document.createElement("img");
      img.className = "lightbox-img lb-transitioning";
      img.src = item.url;
      img.alt = item.name;
      img.onerror = () => {
        if (!img.dataset.proxied) {
          img.dataset.proxied = "1";
          let target = item.url;
          if (target.includes("/api/file/proxy?url=")) {
            try {
              target = decodeURIComponent(
                target.split("/api/file/proxy?url=")[1],
              );
            } catch (_) {}
          }
          img.src = `/api/file/proxy?url=${encodeURIComponent(target)}`;
          return;
        }
        img.style.display = "none";
        const err = document.createElement("div");
        err.className = "lb-error-box";
        err.innerHTML = `
          <span style="font-size:32px;">🖼️</span>
          <span>Unable to preview image</span>
          <a href="${item.url}" target="_blank" class="lb-error-link">Open in new tab ↗</a>
        `;
        lightboxBody.appendChild(err);
      };
      lightboxBody.appendChild(img);

      // Trigger fade-in
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          img.classList.remove("lb-transitioning");
        }),
      );

      const applyTransform = (smooth = true) => {
        img.style.transition = smooth
          ? "transform 0.25s cubic-bezier(0.22, 1, 0.36, 1)"
          : "none";
        img.style.transform = `translate(${_lbImgX}px, ${_lbImgY}px) scale(${_lbScale})`;
      };

      const setZoom = (scale, smooth = true) => {
        _lbScale = Math.max(1, Math.min(8, scale));
        if (_lbScale === 1) {
          _lbImgX = 0;
          _lbImgY = 0;
        }
        applyTransform(smooth);
        img.classList.toggle("zoomed-in", _lbScale > 1);
        if (zoomToggleBtn) {
          zoomToggleBtn.classList.toggle("active", _lbScale > 1);
          zoomToggleBtn.title =
            _lbScale > 1 ? "Fit to Screen" : "1:1 Original Size";
        }
      };

      const toggleZoom = () => setZoom(_lbScale > 1 ? 1 : 4);

      // Zoom-in/out/reset buttons
      const zbIn = document.getElementById("lb-zoom-in-btn");
      const zbOut = document.getElementById("lb-zoom-out-btn");
      const zbReset = document.getElementById("lb-zoom-reset-btn");
      if (zbIn) zbIn.onclick = () => setZoom(_lbScale * 1.5);
      if (zbOut) zbOut.onclick = () => setZoom(_lbScale / 1.5);
      if (zbReset) zbReset.onclick = () => setZoom(1);

      // Click to toggle zoom
      img.addEventListener("click", () => {
        if (hasDragged) {
          hasDragged = false;
          return;
        }
        toggleZoom();
      });

      if (zoomToggleBtn) zoomToggleBtn.onclick = toggleZoom;

      // Drag to pan
      img.addEventListener("mousedown", (e) => {
        if (_lbScale <= 1) return;
        isDragging = true;
        hasDragged = false;
        dragStartX = e.clientX - _lbImgX;
        dragStartY = e.clientY - _lbImgY;
        img.classList.add("grabbing");
        e.preventDefault();
      });

      const onMove = (e) => {
        if (!isDragging || _lbScale <= 1) return;
        const nx = e.clientX - dragStartX;
        const ny = e.clientY - dragStartY;
        if (Math.abs(nx - _lbImgX) > 3 || Math.abs(ny - _lbImgY) > 3)
          hasDragged = true;
        _lbImgX = nx;
        _lbImgY = ny;
        applyTransform(false);
      };

      const onUp = () => {
        if (!isDragging) return;
        isDragging = false;
        img.classList.remove("grabbing");
      };

      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);

      // Wheel scroll to zoom
      const onWheel = (e) => {
        e.preventDefault();
        const delta = e.deltaY > 0 ? 0.85 : 1.2;
        setZoom(_lbScale * delta, false);
      };
      lightboxBody.addEventListener("wheel", onWheel, { passive: false });

      lightboxCleanup = () => {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        lightboxBody.removeEventListener("wheel", onWheel);
        if (zbIn) zbIn.onclick = null;
        if (zbOut) zbOut.onclick = null;
        if (zbReset) zbReset.onclick = null;
        if (zoomToggleBtn) zoomToggleBtn.onclick = null;
      };
    } else {
      // Bitrix previews PDFs inline. Other document types (DOCX, XLSX, ZIP,
      // etc.) must be handed back to Bitrix rather than being forced into a
      // PDF iframe, which is the source of the blank/broken preview bug.
      if (lightboxFileIcon) lightboxFileIcon.textContent = "📎";
      if (zoomToggleBtn) zoomToggleBtn.style.display = "none";
      if (lbZoomControls) lbZoomControls.style.display = "none";

      const panel = document.createElement("div");
      panel.className = "lb-document-panel";
      const icon = document.createElement("span");
      icon.className = "lb-document-icon";
      icon.textContent = "📄";
      const name = document.createElement("strong");
      name.className = "lb-document-name";
      name.textContent = item.name || "Document";
      const message = document.createElement("p");
      message.textContent = "Open this file using the Bitrix24 viewer.";
      const openButton = document.createElement("button");
      openButton.type = "button";
      openButton.className = "lb-document-open";
      openButton.textContent = "Open in Bitrix24";
      openButton.addEventListener("click", () => openInBitrixViewer(item.url));
      panel.append(icon, name, message, openButton);
      lightboxBody.appendChild(panel);
    }
  }

  /**
   * Opens the premium gallery lightbox.
   * @param {string} title   - file name / title
   * @param {string} url     - file URL
   * @param {boolean} isPdf  - true = PDF iframe, false = image
   * @param {Array} gallery  - optional array of {url,name,isImage,isPdf} for multi-item galleries
   * @param {number} startIdx - index in gallery to open
   */
  function openLightbox(
    title,
    url,
    isPdf = false,
    gallery = null,
    startIdx = 0,
    sourceEl = null,
  ) {
    if (gallery && gallery.length > 1) {
      _lbGallery = gallery;
      _lbIndex = startIdx;
    } else {
      _lbGallery = [{ url, name: title, isImage: !isPdf, isPdf }];
      _lbIndex = 0;
    }

    _lbBuildFilmstrip(_lbGallery);
    _lbRenderCurrent();
    _lbSetCounter();
    _lbSetNavState();

    // Inside Bitrix24 iframe tab or expanded document, position modal relative to user's current view
    const isEmbedded =
      window.self !== window.top ||
      document.documentElement.scrollHeight > window.innerHeight + 150;
    const contentEl = lightboxModal.querySelector(".lightbox-content");
    if (isEmbedded) {
      const docHeight = Math.max(
        document.documentElement.scrollHeight,
        document.body.scrollHeight,
        window.innerHeight,
      );
      lightboxModal.style.position = "absolute";
      lightboxModal.style.top = "0px";
      lightboxModal.style.left = "0px";
      lightboxModal.style.width = "100%";
      lightboxModal.style.height = docHeight + "px";
      lightboxModal.style.minHeight = "100%";
      lightboxModal.style.alignItems = "flex-start";

      let targetTop = 40;
      if (sourceEl) {
        const elTop =
          sourceEl.getBoundingClientRect().top +
          (window.pageYOffset || document.documentElement.scrollTop || 0);
        targetTop = Math.max(20, elTop - 340);
      } else {
        const scrollPos =
          window.pageYOffset || document.documentElement.scrollTop || 0;
        targetTop = Math.max(20, scrollPos + 40);
      }

      if (contentEl) {
        contentEl.style.height = "85vh";
        contentEl.style.maxHeight = "820px";
        contentEl.style.marginTop = targetTop + "px";
        try {
          contentEl.scrollIntoView({ behavior: "smooth", block: "center" });
        } catch (_) {}
      }
    } else {
      lightboxModal.style.position = "fixed";
      lightboxModal.style.top = "0px";
      lightboxModal.style.left = "0px";
      lightboxModal.style.width = "100%";
      lightboxModal.style.height = "100vh";
      lightboxModal.style.maxHeight = "100vh";
      lightboxModal.style.alignItems = "center";
      if (contentEl) {
        contentEl.style.height = "100%";
        contentEl.style.maxHeight = "100%";
        contentEl.style.marginTop = "";
      }
    }

    lightboxModal.style.display = "flex";
    lightboxModal.classList.add("is-open");
    document.body.style.overflow = "hidden";
  }

  function closeLightbox() {
    if (lightboxCleanup) {
      lightboxCleanup();
      lightboxCleanup = null;
    }
    const contentEl = lightboxModal.querySelector(".lightbox-content");
    if (contentEl) {
      contentEl.style.height = "";
      contentEl.style.maxHeight = "";
      contentEl.style.marginTop = "";
    }
    lightboxModal.style.display = "none";
    lightboxModal.classList.remove("is-open");
    lightboxModal.style.position = "";
    lightboxModal.style.top = "";
    lightboxModal.style.left = "";
    lightboxModal.style.width = "";
    lightboxModal.style.height = "";
    lightboxModal.style.minHeight = "";
    lightboxModal.style.maxHeight = "";
    lightboxModal.style.alignItems = "";
    document.body.style.overflow = "";
    // Clear dynamic children
    const img = lightboxBody.querySelector(".lightbox-img");
    const iframe = lightboxBody.querySelector(".lightbox-iframe");
    const errorBox = lightboxBody.querySelector(".lb-error-box");
    if (img) img.remove();
    if (iframe) iframe.remove();
    if (errorBox) errorBox.remove();
    document.body.style.overflow = "";
    _lbGallery = [];
    _lbIndex = 0;
    _lbScale = 1;
    _lbImgX = 0;
    _lbImgY = 0;
    const zoomToggleBtn = document.getElementById("lightbox-zoom-toggle-btn");
    if (zoomToggleBtn) {
      zoomToggleBtn.style.display = "none";
      zoomToggleBtn.onclick = null;
    }
    if (lbZoomControls) lbZoomControls.style.display = "none";
    lbFilmstrip.style.display = "none";
    lightboxCounter.style.display = "none";
    lbNavPrev.style.display = "none";
    lbNavNext.style.display = "none";
  }

  // Event listeners
  lightboxCloseBtn.addEventListener("click", closeLightbox);
  lightboxModal.addEventListener("click", (e) => {
    if (
      e.target === lightboxModal ||
      e.target.classList.contains("b24-native-viewer")
    ) {
      closeLightbox();
    }
  });
  lbNavPrev.addEventListener("click", () => _lbGoTo(_lbIndex - 1));
  lbNavNext.addEventListener("click", () => _lbGoTo(_lbIndex + 1));

  // Native Bitrix24 Viewer '•••' more options button (opens path natively in Bitrix24 or new tab)
  const b24ViewerMoreBtn = document.getElementById("b24-viewer-more-btn");
  if (b24ViewerMoreBtn) {
    b24ViewerMoreBtn.addEventListener("click", () => {
      const item = _lbGallery[_lbIndex];
      if (item && item.url) {
        openInBitrixViewer(item.url);
      }
    });
  }

  document.addEventListener("keydown", (e) => {
    if (lightboxModal.style.display !== "flex") return;
    if (e.key === "Escape") {
      closeLightbox();
      return;
    }
    if (e.key === "ArrowLeft") {
      _lbGoTo(_lbIndex - 1);
      return;
    }
    if (e.key === "ArrowRight") {
      _lbGoTo(_lbIndex + 1);
      return;
    }
    if (e.key === "+" || e.key === "=") {
      const zbIn = document.getElementById("lb-zoom-in-btn");
      if (zbIn) zbIn.click();
      return;
    }
    if (e.key === "-" || e.key === "_") {
      const zbOut = document.getElementById("lb-zoom-out-btn");
      if (zbOut) zbOut.click();
      return;
    }
    if (e.key === "0") {
      const zbReset = document.getElementById("lb-zoom-reset-btn");
      if (zbReset) zbReset.click();
      return;
    }
  });

  // ============================================================================
  // 5. IN-WINDOW MEDIA & FILE PREVIEW COMPONENT
  // ============================================================================
  function formatBytes(bytes) {
    if (!bytes || bytes === 0) return "";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  }

  function renderMediaField(field, rawValue, container) {
    const card = document.createElement("div");
    card.className = "file-upload-card";

    // 1. Bitrix24 Native View Switcher Bar (Tile, List, Fit width)
    const switcher = document.createElement("div");
    switcher.className = "b24-view-switcher";
    switcher.innerHTML = `
      <button type="button" class="b24-view-btn active" data-view="tile" title="Tile view">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>
        Tile
      </button>
      <button type="button" class="b24-view-btn" data-view="list" title="List view">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>
        List
      </button>
      <button type="button" class="b24-view-btn" data-view="fit" title="Fit width">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="15 3 21 3 21 9"></polyline><polyline points="9 21 3 21 3 15"></polyline><line x1="21" y1="3" x2="14" y2="10"></line><line x1="3" y1="21" x2="10" y2="14"></line></svg>
        Fit width
      </button>
    `;

    // 2. Dropzone Bar (Clean, single-line icon + text group)
    const dropzone = document.createElement("div");
    dropzone.className = "dropzone-box";
    const isMulti =
      field.isMultiple ||
      field.key.includes("DOCS") ||
      field.key.includes("1791544736052") ||
      field.key.includes("1791881642219") ||
      field.key.includes("1791881665252");
    const uploadLabel = field.isImage
      ? isMulti
        ? "Upload Photos"
        : "Upload Image"
      : isMulti
        ? "Upload Documents"
        : "Upload Document";

    dropzone.innerHTML = `
      <span class="dropzone-icon">📁</span>
      <div class="dropzone-text-group">
        <span class="dropzone-title">${uploadLabel}</span>
        <span class="dropzone-sub">Click to browse or drop file</span>
      </div>
      <input type="file" id="file_input_${field.key}" style="display:none" ${isMulti ? "multiple" : ""}>
    `;

    const fileInput = dropzone.querySelector("input");
    dropzone.addEventListener("click", () => fileInput.click());

    dropzone.addEventListener("dragover", (e) => {
      e.preventDefault();
      dropzone.classList.add("dragover");
    });
    dropzone.addEventListener("dragleave", () =>
      dropzone.classList.remove("dragover"),
    );
    dropzone.addEventListener("drop", (e) => {
      e.preventDefault();
      dropzone.classList.remove("dragover");
      if (e.dataTransfer.files?.length) {
        handleLocalFiles(
          field.key,
          e.dataTransfer.files,
          viewportBox,
          stripWrap,
        );
      }
    });

    fileInput.addEventListener("change", () => {
      if (fileInput.files?.length) {
        handleLocalFiles(field.key, fileInput.files, viewportBox, stripWrap);
      }
    });

    // 3. In-Window Inline Preview Viewport (Kept for compatibility)
    const viewportBox = document.createElement("div");
    viewportBox.className = "inline-preview-viewport";
    viewportBox.id = `viewport_${field.key}`;
    viewportBox.style.display = "none";

    // 4. Bitrix24 Files Container (Unified Preview Tiles Strip)
    const stripWrap = document.createElement("div");
    stripWrap.className = "thumbnail-strip b24-files-container";
    stripWrap.id = `strip_${field.key}`;

    switcher.querySelectorAll(".b24-view-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        switcher
          .querySelectorAll(".b24-view-btn")
          .forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        const viewMode = btn.dataset.view;
        stripWrap.classList.remove("view-tile", "view-list", "view-fit");
        stripWrap.classList.add(`view-${viewMode}`);
      });
    });

    // Collect and normalize all existing files into a field gallery
    const existingList = Array.isArray(rawValue)
      ? rawValue
      : rawValue
        ? [rawValue]
        : [];
    const fieldGallery = [];

    existingList.forEach((fileItem, idx) => {
      if (!fileItem) return;

      let fileUrl = "";
      let fileName = "";
      let fid = null;

      if (typeof fileItem === "object") {
        fileUrl =
          fileItem.urlMachine ||
          fileItem.showUrl ||
          fileItem.downloadUrl ||
          fileItem.url ||
          fileItem.src ||
          fileItem.SRC ||
          "";
        fid = fileItem.id || fileItem.ID || fileItem.fileId || null;
        if (!fileUrl && fid) {
          fileUrl = `/bitrix/tools/crm_show_file.php?fileId=${fid}`;
        }
        fileName =
          fileItem.name ||
          fileItem.NAME ||
          fileItem.fileName ||
          fileItem.originalName ||
          fileItem.ORIGINAL_NAME ||
          "";
        if (!fileName && fileUrl) {
          const m = fileUrl.match(/filename=([^&]+)/i);
          if (m && m[1]) {
            try {
              fileName = decodeURIComponent(m[1]);
            } catch (_) {
              fileName = m[1];
            }
          }
        }
        if (!fileName) {
          fileName = fid ? `File #${fid}` : `${field.label} #${idx + 1}`;
        }
      } else if (
        typeof fileItem === "number" ||
        (typeof fileItem === "string" && /^\d+$/.test(fileItem.trim()))
      ) {
        fid = String(fileItem).trim();
        fileUrl = `/bitrix/tools/crm_show_file.php?fileId=${fid}`;
        fileName = `${field.label} #${idx + 1}`;
      } else if (typeof fileItem === "string" && fileItem.startsWith("http")) {
        fileUrl = fileItem;
        fileName = fileItem.split("/").pop().split("?")[0] || "Attached File";
      } else if (typeof fileItem === "string" && fileItem.trim()) {
        fileUrl = fileItem.trim();
        fileName =
          fileItem.split("/").pop().split("?")[0] ||
          `${field.label} #${idx + 1}`;
      }

      if (!fileUrl) return;

      if (!fid && fileUrl) {
        const idMatch =
          fileUrl.match(/(?:fileId|file_id|id)=(\d+)/i) ||
          fileUrl.match(/\/file\/(\d+)/i);
        if (idMatch) fid = idMatch[1];
      }

      const domain =
        window.__BITRIX_DOMAIN__ ||
        (window.location ? window.location.hostname : "csl.bitrix24.com");
      let fullUrl = fileUrl.startsWith("http")
        ? fileUrl
        : `https://${domain}${fileUrl.startsWith("/") ? "" : "/"}${fileUrl}`;
      if (fullUrl.includes("ajax.php") && !fullUrl.includes("token=")) {
        fullUrl = `/api/file/proxy?url=${encodeURIComponent(fullUrl)}`;
      }

      const isImage =
        field.isImage ||
        /\.(png|jpe?g|webp|gif|svg)($|\?)/i.test(fileName || fullUrl);
      const isPdf =
        /\.pdf($|\?)/i.test(fileName || fullUrl) || (!isImage && field.isDoc);

      fieldGallery.push({
        url: fullUrl,
        name: fileName,
        isImage,
        isPdf,
        id: fid,
      });
    });

    fieldGallery.forEach((item, itemIdx) => {
      const thumb = document.createElement("div");
      thumb.className = `thumb-item ${item.isImage ? "preview-thumb-wrap" : "preview-doc-wrap"} b24-file-tile`;
      thumb.title = `${item.name} - Click to preview`;

      if (item.isImage) {
        thumb.innerHTML = `
          <div class="b24-tile-thumb-wrap">
            <img class="thumb-item-img b24-tile-img" src="${item.url}" alt="${item.name}" loading="lazy">
            <div class="thumb-zoom-overlay">🔍 View</div>
            <button type="button" class="thumb-remove-btn" title="Remove file" aria-label="Remove file">✕</button>
          </div>
          <div class="b24-tile-footer">
            <span class="b24-tile-name" title="${item.name}">${item.name}</span>
            <div class="b24-list-actions">
              <button type="button" class="b24-list-btn view-btn" title="View / Preview">🔍 View</button>
              <button type="button" class="b24-list-btn remove-btn thumb-remove-btn-list" title="Remove file">✕</button>
            </div>
          </div>
        `;

        const thumbImg = thumb.querySelector(".thumb-item-img");
        thumbImg.onerror = function () {
          if (!this.dataset.proxied) {
            this.dataset.proxied = "1";
            let target = item.url;
            if (target.includes("/api/file/proxy?url=")) {
              try {
                target = decodeURIComponent(
                  target.split("/api/file/proxy?url=")[1],
                );
              } catch (_) {}
            }
            this.src = `/api/file/proxy?url=${encodeURIComponent(target)}`;
          } else {
            this.onerror = null;
            const wrap = thumb.querySelector(".b24-tile-thumb-wrap");
            wrap.innerHTML = `
              <div class="doc-tile-inner"><span class="doc-tile-badge img">IMG</span><span class="doc-tile-icon">🖼️</span></div>
              <div class="thumb-zoom-overlay">🔍 View</div>
              <button type="button" class="thumb-remove-btn" title="Remove file" aria-label="Remove file">✕</button>
            `;
            const retryRemove = wrap.querySelector(".thumb-remove-btn");
            if (retryRemove)
              retryRemove.addEventListener("click", handleRemoveItem);
          }
        };
      } else {
        thumb.innerHTML = `
          <div class="b24-tile-thumb-wrap">
            <div class="doc-tile-inner">
              <span class="doc-tile-badge ${item.isPdf ? "pdf" : "doc"}">${item.isPdf ? "PDF" : "DOC"}</span>
              <span class="doc-tile-icon">📄</span>
            </div>
            <div class="thumb-zoom-overlay">🔍 View</div>
            <button type="button" class="thumb-remove-btn" title="Remove file" aria-label="Remove file">✕</button>
          </div>
          <div class="b24-tile-footer">
            <span class="b24-tile-name" title="${item.name}">${item.name}</span>
            <div class="b24-list-actions">
              <button type="button" class="b24-list-btn view-btn" title="View / Preview">🔍 View</button>
              <button type="button" class="b24-list-btn remove-btn thumb-remove-btn-list" title="Remove file">✕</button>
            </div>
          </div>
        `;
      }

      const handleRemoveItem = (ev) => {
        ev.stopPropagation();
        ev.preventDefault();

        if (item.id) {
          if (!removedFileIds[field.key]) {
            removedFileIds[field.key] = new Set();
          }
          removedFileIds[field.key].add(String(item.id));
        }

        const gIdx = fieldGallery.indexOf(item);
        if (gIdx !== -1) {
          fieldGallery.splice(gIdx, 1);
        }

        thumb.remove();
        setDirty(true);
        resizeWindow();
        showToast(
          `Marked "${item.name}" for removal. Click Save Changes to apply.`,
          "info",
        );
      };

      const removeBtn = thumb.querySelector(".thumb-remove-btn");
      if (removeBtn) removeBtn.addEventListener("click", handleRemoveItem);

      const listRemoveBtn = thumb.querySelector(".thumb-remove-btn-list");
      if (listRemoveBtn)
        listRemoveBtn.addEventListener("click", handleRemoveItem);

      const listViewBtn = thumb.querySelector(".b24-list-btn.view-btn");
      if (listViewBtn) {
        listViewBtn.addEventListener("click", (ev) => {
          ev.stopPropagation();
          const currIdx = Math.max(0, fieldGallery.indexOf(item));
          openLightbox(
            item.name,
            item.url,
            item.isPdf,
            fieldGallery,
            currIdx,
            thumb,
          );
          stripWrap
            .querySelectorAll(".thumb-item")
            .forEach((t) => t.classList.remove("active"));
          thumb.classList.add("active");
        });
      }

      thumb.addEventListener("click", (ev) => {
        if (
          ev.target.closest(".thumb-remove-btn") ||
          ev.target.closest(".thumb-remove-btn-list") ||
          ev.target.closest(".b24-list-actions")
        ) {
          return;
        }
        const currIdx = Math.max(0, fieldGallery.indexOf(item));
        openLightbox(
          item.name,
          item.url,
          item.isPdf,
          fieldGallery,
          currIdx,
          thumb,
        );
        stripWrap
          .querySelectorAll(".thumb-item")
          .forEach((t) => t.classList.remove("active"));
        thumb.classList.add("active");
      });

      stripWrap.appendChild(thumb);
    });

    card.appendChild(switcher);
    card.appendChild(stripWrap);
    card.appendChild(dropzone);
    card.appendChild(viewportBox);
    container.appendChild(card);
  }

  // Shows an image directly inside the inline viewport in the same window
  function showInWindowImage(
    viewportBox,
    url,
    name,
    gallery = null,
    index = 0,
  ) {
    viewportBox.style.display = "flex";
    viewportBox.innerHTML = `
      <div class="inline-preview-topbar">
        <span class="inline-preview-name">👁 Preview: ${name}</span>
        <div class="inline-preview-topbar-actions">
          <button type="button" class="inline-preview-action-btn zoom-btn" title="Expand into Gallery Lightbox">⛶ Expand</button>
          <a href="${url}" download="${name}" target="_blank" class="inline-preview-action-btn" title="Download">⬇</a>
          <button type="button" class="inline-preview-close" title="Hide Preview">✕</button>
        </div>
      </div>
    `;

    const img = document.createElement("img");
    img.className = "inline-preview-img";
    img.src = url;
    img.alt = name;
    img.title = "Click to open gallery viewer";
    img.onerror = function () {
      if (!this.dataset.proxied && url.startsWith("http")) {
        this.dataset.proxied = "1";
        this.src = `/api/file/proxy?url=${encodeURIComponent(url)}`;
      } else {
        this.onerror = null;
        this.style.display = "none";
        const errDiv = document.createElement("div");
        errDiv.style.cssText =
          "display:flex;flex-direction:column;align-items:center;justify-content:center;height:140px;color:#94a3b8;font-size:13px;";
        errDiv.innerHTML = `<span>🖼️ Unable to load preview</span><a href="${url}" target="_blank" style="color:#38bdf8;margin-top:6px;font-size:12px;text-decoration:none;">Open image link ↗</a>`;
        viewportBox.appendChild(errDiv);
      }
    };
    viewportBox.appendChild(img);

    const openViewer = () =>
      openLightbox(name, url, false, gallery, index, viewportBox);
    viewportBox
      .querySelector(".zoom-btn")
      .addEventListener("click", openViewer);
    img.addEventListener("click", openViewer);
    viewportBox.classList.remove("is-pdf-viewport");
    viewportBox
      .querySelector(".inline-preview-close")
      .addEventListener("click", () => {
        viewportBox.classList.remove("is-pdf-viewport");
        viewportBox.style.display = "none";
        viewportBox.innerHTML = "";
        resizeWindow();
      });
    resizeWindow();
  }

  // Shows a PDF directly inside the inline viewport in the same window
  function showInWindowPdf(viewportBox, url, name, gallery = null, index = 0) {
    const proxyUrl =
      url.startsWith("http") && !url.includes("/api/file/proxy")
        ? `/api/file/proxy?url=${encodeURIComponent(url)}`
        : url;

    viewportBox.classList.add("is-pdf-viewport");
    viewportBox.style.display = "flex";
    viewportBox.innerHTML = `
      <div class="inline-preview-topbar">
        <span class="inline-preview-name">📄 PDF Viewer: ${name}</span>
        <div class="inline-preview-topbar-actions">
          <button type="button" class="inline-preview-action-btn zoom-btn" title="Expand into Gallery Lightbox">⛶ Expand</button>
          <a href="${proxyUrl}" target="_blank" class="inline-preview-action-btn" title="Open PDF in new tab">↗ Open</a>
          <a href="${proxyUrl}" download="${name}" class="inline-preview-action-btn" title="Download">⬇</a>
          <button type="button" class="inline-preview-close" title="Hide PDF">✕</button>
        </div>
      </div>
      <iframe class="inline-preview-iframe" src="${proxyUrl}">
        <p style="padding:20px;color:#fff;">Your browser does not support inline PDF viewing. <a href="${proxyUrl}" target="_blank" style="color:#38bdf8;">Click here to open the document ↗</a></p>
      </iframe>
    `;

    viewportBox
      .querySelector(".zoom-btn")
      .addEventListener("click", () =>
        openLightbox(name, url, true, gallery, index, viewportBox),
      );
    viewportBox
      .querySelector(".inline-preview-close")
      .addEventListener("click", () => {
        viewportBox.classList.remove("is-pdf-viewport");
        viewportBox.style.display = "none";
        viewportBox.innerHTML = "";
        resizeWindow();
      });
    resizeWindow();
  }

  // Handle local newly selected files with instant in-window FileReader preview
  function handleLocalFiles(fieldKey, files, viewportBox, stripWrap) {
    if (!pendingFileUploads[fieldKey]) {
      pendingFileUploads[fieldKey] = [];
    }

    Array.from(files).forEach((file) => {
      const isImage =
        file.type.startsWith("image/") ||
        /\.(png|jpe?g|webp|gif|svg)$/i.test(file.name);
      const isPdf =
        file.type === "application/pdf" || file.name.endsWith(".pdf");
      const reader = new FileReader();

      reader.onload = function (e) {
        const dataUrl = e.target.result;
        const pendingItem = {
          file,
          dataUrl,
          name: file.name,
          size: file.size,
          isImage,
          isPdf,
        };
        pendingFileUploads[fieldKey].push(pendingItem);
        setDirty(true);

        if (isImage) {
          // Append thumbnail tile to strip (Bitrix24 native 140x110px tile)
          const thumb = document.createElement("div");
          thumb.className =
            "thumb-item preview-thumb-wrap b24-file-tile active";
          thumb.title = `${file.name} (Ready to upload)`;
          thumb.innerHTML = `
            <div class="b24-tile-thumb-wrap">
              <img class="thumb-item-img b24-tile-img" src="${dataUrl}" alt="${file.name}">
              <div class="thumb-zoom-overlay">🔍 View</div>
              <button type="button" class="thumb-remove-btn" title="Remove">✕</button>
            </div>
            <div class="b24-tile-footer">
              <span class="b24-tile-name" title="${file.name}">${file.name}</span>
              <div class="b24-list-actions">
                <button type="button" class="b24-list-btn view-btn" title="View / Preview">🔍 View</button>
                <button type="button" class="b24-list-btn remove-btn thumb-remove-btn-list" title="Remove">✕</button>
              </div>
            </div>
          `;

          const removeLocalItem = (ev) => {
            ev.stopPropagation();
            const idx = pendingFileUploads[fieldKey].indexOf(pendingItem);
            if (idx > -1) pendingFileUploads[fieldKey].splice(idx, 1);
            thumb.remove();
            viewportBox.style.display = "none";
            viewportBox.innerHTML = "";
            setDirty(true);
            resizeWindow();
          };

          thumb
            .querySelector(".thumb-remove-btn")
            .addEventListener("click", removeLocalItem);
          const listRem = thumb.querySelector(".thumb-remove-btn-list");
          if (listRem) listRem.addEventListener("click", removeLocalItem);

          const listVw = thumb.querySelector(".b24-list-btn.view-btn");
          if (listVw) {
            listVw.addEventListener("click", (ev) => {
              ev.stopPropagation();
              openLightbox(file.name, dataUrl, false, null, 0, thumb);
              stripWrap
                .querySelectorAll(".thumb-item")
                .forEach((t) => t.classList.remove("active"));
              thumb.classList.add("active");
            });
          }

          thumb.addEventListener("click", (ev) => {
            if (
              ev.target.closest(".thumb-remove-btn") ||
              ev.target.closest(".thumb-remove-btn-list") ||
              ev.target.closest(".b24-list-actions")
            )
              return;
            openLightbox(file.name, dataUrl, false, null, 0, thumb);
            stripWrap
              .querySelectorAll(".thumb-item")
              .forEach((t) => t.classList.remove("active"));
            thumb.classList.add("active");
          });

          stripWrap
            .querySelectorAll(".thumb-item")
            .forEach((t) => t.classList.remove("active"));
          stripWrap.appendChild(thumb);
        } else {
          // Document tile of exact same Bitrix24 native 140x110px size
          const docThumb = document.createElement("div");
          docThumb.className =
            "thumb-item preview-doc-wrap b24-file-tile active";
          docThumb.title = `${file.name} (Ready to upload)`;
          docThumb.innerHTML = `
            <div class="b24-tile-thumb-wrap">
              <div class="doc-tile-inner">
                <span class="doc-tile-badge ${isPdf ? "pdf" : "doc"}">${isPdf ? "PDF" : "DOC"}</span>
                <span class="doc-tile-icon">📄</span>
              </div>
              <div class="thumb-zoom-overlay">🔍 View</div>
              <button type="button" class="thumb-remove-btn" title="Remove">✕</button>
            </div>
            <div class="b24-tile-footer">
              <span class="b24-tile-name" title="${file.name}">${file.name}</span>
              <div class="b24-list-actions">
                <button type="button" class="b24-list-btn view-btn" title="View / Preview">🔍 View</button>
                <button type="button" class="b24-list-btn remove-btn thumb-remove-btn-list" title="Remove">✕</button>
              </div>
            </div>
          `;

          const removeDocItem = (ev) => {
            ev.stopPropagation();
            const idx = pendingFileUploads[fieldKey].indexOf(pendingItem);
            if (idx > -1) pendingFileUploads[fieldKey].splice(idx, 1);
            docThumb.remove();
            viewportBox.style.display = "none";
            viewportBox.innerHTML = "";
            setDirty(true);
            scheduleResize(40);
          };

          docThumb
            .querySelector(".thumb-remove-btn")
            .addEventListener("click", removeDocItem);
          const docListRem = docThumb.querySelector(".thumb-remove-btn-list");
          if (docListRem) docListRem.addEventListener("click", removeDocItem);

          const docListVw = docThumb.querySelector(".b24-list-btn.view-btn");
          if (docListVw) {
            docListVw.addEventListener("click", (ev) => {
              ev.stopPropagation();
              openLightbox(file.name, dataUrl, isPdf, null, 0, docThumb);
              stripWrap
                .querySelectorAll(".thumb-item")
                .forEach((t) => t.classList.remove("active"));
              docThumb.classList.add("active");
            });
          }

          docThumb.addEventListener("click", (ev) => {
            if (
              ev.target.closest(".thumb-remove-btn") ||
              ev.target.closest(".thumb-remove-btn-list") ||
              ev.target.closest(".b24-list-actions")
            )
              return;
            openLightbox(file.name, dataUrl, isPdf, null, 0, docThumb);
            stripWrap
              .querySelectorAll(".thumb-item")
              .forEach((t) => t.classList.remove("active"));
            docThumb.classList.add("active");
          });

          stripWrap
            .querySelectorAll(".thumb-item")
            .forEach((t) => t.classList.remove("active"));
          stripWrap.appendChild(docThumb);
        }
      };

      reader.readAsDataURL(file);
    });
  }

  // ============================================================================
  // 6. DYNAMIC LAYOUT & FIELD RENDERING
  // ============================================================================
  function renderLayout(layoutKey) {
    currentLayout = layoutKey;
    const meta = CONFIG.layoutMeta[layoutKey] || CONFIG.layoutMeta.rent;

    // 1. Update Layout Mode Pill in Toolbar
    layoutModeBadge.className = `layout-pill ${meta.pillClass}`;
    layoutModeBadge.innerHTML = `${meta.icon} ${meta.title}`;

    // 2. Clear container
    sectionsContainer.innerHTML = "";
    sectionNavPills.innerHTML = "";
    initialFormValues = {};

    let totalActiveFieldsCount = 0;

    CONFIG.sections.forEach((sec, secIdx) => {
      const activeFields = [];

      sec.fields.forEach((f) => {
        const rule = f.rules?.[layoutKey] || "show";
        if (rule !== "hide") {
          activeFields.push(f);
        }
      });

      const sectionActiveCount = activeFields.length;
      totalActiveFieldsCount += sectionActiveCount;

      if (sectionActiveCount === 0) return;

      // Jump-to Navigation Pill
      const pill = document.createElement("button");
      pill.type = "button";
      pill.className = `nav-pill ${secIdx === 0 ? "active" : ""}`;
      pill.setAttribute("data-target-sec", sec.id);
      pill.innerHTML = `<span>${sec.icon} ${sec.title}</span><span class="nav-pill-count">${sectionActiveCount}</span>`;
      pill.addEventListener("click", () => {
        document
          .querySelectorAll(".nav-pill")
          .forEach((p) => p.classList.remove("active"));
        pill.classList.add("active");
        const targetEl = document.getElementById(`sec_${sec.id}`);
        if (targetEl) {
          targetEl.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      });
      sectionNavPills.appendChild(pill);

      // Section Card
      const card = document.createElement("div");
      card.className = "section-card";
      card.id = `sec_${sec.id}`;

      // Card Header (Minimal)
      const header = document.createElement("div");
      header.className = "section-header";
      header.innerHTML = `
        <div class="section-title-wrap">
          <span class="section-icon">${sec.icon}</span>
          <span class="section-title">${sec.title}</span>
          <span class="section-desc">${sec.desc}</span>
        </div>
        <div class="section-header-right">
          <span class="section-count-badge">${sectionActiveCount}</span>
          <span class="section-chevron">▼</span>
        </div>
      `;
      header.addEventListener("click", () => {
        card.classList.toggle("collapsed");
        scheduleResize(50);
      });
      card.appendChild(header);

      // Card Body
      const body = document.createElement("div");
      body.className = "section-body";

      // Primary Grid (renders all active fields in section order)
      const primaryGrid = document.createElement("div");
      primaryGrid.className = "fields-grid";

      activeFields.forEach((f) => {
        primaryGrid.appendChild(createFieldElement(f, layoutKey));
      });
      body.appendChild(primaryGrid);

      card.appendChild(body);
      sectionsContainer.appendChild(card);
    });

    fieldsCountBadge.textContent = `${totalActiveFieldsCount} fields`;
    resizeWindow();
  }

  // ============================================================================
  // 6b. LOOKUP FIELDS & LINKED RECORD ACCESSIBILITY
  // ============================================================================
  const entityTitleCache = {};

  function isLookupField(f) {
    if (!f) return false;
    const lookupTypes = [
      "crm_company",
      "crm_contact",
      "crm_contact_multi",
      "crm_entity",
      "user",
      "crm",
      "lookup",
    ];
    if (lookupTypes.includes(f.type)) return true;
    if (f.lookupEntity) return true;
    if (
      f.key === "companyId" ||
      f.key === "contactId" ||
      f.key === "contactIds" ||
      f.key === "assignedById"
    )
      return true;
    if (f.key && f.key.startsWith("parentId")) return true;
    if (
      f.key === "ufCrm16ProjectName" ||
      f.key === "ufCrm16MasterProject" ||
      f.key === "ufCrm16_1791173000" ||
      f.key === "ufCrm16_1791173131" ||
      f.key === "ufCrm16Layout" ||
      f.key === "ufCrm16Listing" ||
      f.key === "ufCrm16ListingAgent" ||
      f.key === "ufCrm16_1791172932"
    )
      return true;
    return false;
  }

  function resolveLookupEntity(f) {
    if (!f) return "master_project";
    if (f.lookupEntity) return f.lookupEntity;
    const key = f.key || "";
    const crmCode = f.crmCode || "";
    const type = f.type || "";
    const k = (key + "_" + crmCode).toLowerCase();

    if (
      k.includes("developer") ||
      key === "companyId" ||
      type === "crm_company"
    )
      return "developer";
    if (
      k.includes("contact") ||
      key === "contactId" ||
      key === "contactIds" ||
      type === "crm_contact" ||
      type === "crm_contact_multi"
    )
      return "contact";
    if (k.includes("property") && !k.includes("masterproject"))
      return "property";
    if (key === "parentId1052" || type === "crm_entity") return "property";
    if (k.includes("layout")) return "layout";
    if (
      k.includes("masterproject") ||
      k.includes("master_project") ||
      key === "ufCrm16_1791173000"
    )
      return "master_project";
    if (k.includes("project") || key === "ufCrm16_1791173131") return "project";
    if (
      k.includes("listingagent") ||
      k.includes("broker") ||
      k.includes("agent")
    )
      return "broker";
    if (k.includes("listing")) return "listing";
    if (key === "assignedById" || type === "user") return "user";
    return "master_project";
  }

  function getEntityMeta(type, key) {
    const k = String(key || "").toLowerCase();
    if (
      type === "crm_company" ||
      key === "companyId" ||
      k.includes("company") ||
      k.includes("developer")
    ) {
      return {
        icon: "🏢",
        label: "Company / Developer",
        defaultPrefix: "Company #",
      };
    }
    if (
      type === "crm_contact" ||
      key === "contactId" ||
      k.includes("contact")
    ) {
      return { icon: "👤", label: "Contact", defaultPrefix: "Contact #" };
    }
    if (type === "crm_contact_multi" || key === "contactIds") {
      return { icon: "👥", label: "Contact", defaultPrefix: "Contact #" };
    }
    if (type === "user" || key === "assignedById") {
      return {
        icon: "👤",
        label: "Responsible Person",
        defaultPrefix: "User #",
      };
    }
    if (
      key === "parentId1052" ||
      (k.includes("property") && !k.includes("masterproject"))
    ) {
      return {
        icon: "🏗️",
        label: "Master Property",
        defaultPrefix: "Master Property #",
      };
    }
    if (k.includes("masterproject") || k.includes("master_project")) {
      return {
        icon: "🏛️",
        label: "Master Project",
        defaultPrefix: "Master Project #",
      };
    }
    if (k.includes("project")) {
      return { icon: "🏢", label: "Project", defaultPrefix: "Project #" };
    }
    if (k.includes("layout")) {
      return { icon: "📐", label: "Layout", defaultPrefix: "Layout #" };
    }
    if (k.includes("listingagent") || k.includes("broker")) {
      return {
        icon: "💼",
        label: "Listing Agent / Broker",
        defaultPrefix: "Broker #",
      };
    }
    if (k.includes("listing")) {
      return { icon: "📋", label: "Listing", defaultPrefix: "Listing #" };
    }
    return { icon: "🔗", label: "CRM Entity", defaultPrefix: "Record #" };
  }

  function getEntityPath(type, rawId, key) {
    if (!rawId) return "";
    const idStr = String(rawId).trim();

    if (idStr.startsWith("CO_")) {
      return `/crm/company/details/${idStr.replace(/^CO_/, "")}/`;
    }
    if (idStr.startsWith("C_")) {
      return `/crm/contact/details/${idStr.replace(/^C_/, "")}/`;
    }
    if (idStr.startsWith("D_")) {
      return `/crm/deal/details/${idStr.replace(/^D_/, "")}/`;
    }
    if (idStr.startsWith("L_")) {
      return `/crm/lead/details/${idStr.replace(/^L_/, "")}/`;
    }
    if (/^DYNAMIC_(\d+)_(\d+)$/.test(idStr)) {
      const parts = idStr.match(/^DYNAMIC_(\d+)_(\d+)$/);
      return `/crm/type/${parts[1]}/details/${parts[2]}/`;
    }
    if (/^T[0-9a-fA-F]+_(\d+)$/.test(idStr)) {
      const parts = idStr.split("_");
      const hex = parts[0].substring(1);
      const spTypeId = parseInt(hex, 16) || 1052;
      return `/crm/type/${spTypeId}/details/${parts[1]}/`;
    }

    const num = idStr.replace(/[^\d]/g, "");
    if (!num) return "";

    const k = String(key || "").toLowerCase();
    if (
      type === "crm_company" ||
      key === "companyId" ||
      k.includes("company") ||
      k.includes("developer")
    ) {
      return `/crm/company/details/${num}/`;
    }
    if (
      type === "crm_contact" ||
      type === "crm_contact_multi" ||
      key === "contactId" ||
      key === "contactIds" ||
      k.includes("contact")
    ) {
      return `/crm/contact/details/${num}/`;
    }
    if (type === "user" || key === "assignedById") {
      return `/company/personal/user/${num}/`;
    }
    if (key === "parentId1052" || k.includes("property")) {
      return `/crm/type/1052/details/${num}/`;
    }
    if (
      k.includes("masterproject") ||
      k.includes("master_project") ||
      key === "ufCrm16_1791173000"
    ) {
      return `/crm/type/1040/details/${num}/`;
    }
    if (k.includes("project") || key === "ufCrm16_1791173131") {
      return `/crm/type/1044/details/${num}/`;
    }
    if (k.includes("layout")) {
      return `/crm/type/1048/details/${num}/`;
    }
    if (k.includes("listingagent") || k.includes("broker")) {
      return `/crm/type/1094/details/${num}/`;
    }
    if (k.includes("listing")) {
      return `/crm/type/1058/details/${num}/`;
    }
    return `/crm/type/1052/details/${num}/`;
  }

  function openLinkedRecord(type, rawId, key, ev) {
    if (ev) {
      ev.preventDefault();
      ev.stopPropagation();
    }
    const path = getEntityPath(type, rawId, key);
    if (!path) {
      showToast("No valid linked record ID to open", "warning");
      return;
    }

    if (window.BX24 && typeof window.BX24.openPath === "function") {
      window.BX24.openPath(path);
    } else {
      const domain =
        window.__BITRIX_DOMAIN__ ||
        (window.location ? window.location.hostname : "csl.bitrix24.com");
      const fullUrl = path.startsWith("http")
        ? path
        : `https://${domain}${path}`;
      window.open(fullUrl, "_blank");
    }
  }

  function fetchEntityTitle(type, id, key, callback) {
    if (!id) return;
    const cacheKey = `${type}_${id}`;
    if (entityTitleCache[cacheKey]) {
      callback(entityTitleCache[cacheKey]);
      return;
    }
    if (!window.BX24 || typeof window.BX24.callMethod !== "function") return;

    const idStr = String(id).trim();
    const num = idStr.replace(/[^\d]/g, "");
    if (!num) return;

    if (
      idStr.startsWith("CO_") ||
      type === "crm_company" ||
      key === "companyId"
    ) {
      window.BX24.callMethod("crm.company.get", { id: num }, (res) => {
        if (!res.error() && res.data()?.TITLE) {
          entityTitleCache[cacheKey] = res.data().TITLE;
          callback(res.data().TITLE);
        }
      });
    } else if (
      idStr.startsWith("C_") ||
      type === "crm_contact" ||
      type === "crm_contact_multi" ||
      key === "contactId" ||
      key === "contactIds"
    ) {
      window.BX24.callMethod("crm.contact.get", { id: num }, (res) => {
        if (!res.error()) {
          const d = res.data();
          const name =
            [d?.NAME, d?.LAST_NAME].filter(Boolean).join(" ") || d?.NAME;
          if (name) {
            entityTitleCache[cacheKey] = name;
            callback(name);
          }
        }
      });
    } else if (type === "user" || key === "assignedById") {
      window.BX24.callMethod("user.get", { ID: num }, (res) => {
        if (!res.error() && res.data()?.[0]) {
          const u = res.data()[0];
          const name =
            [u.NAME, u.LAST_NAME].filter(Boolean).join(" ") || u.LOGIN;
          if (name) {
            entityTitleCache[cacheKey] = name;
            callback(name);
          }
        }
      });
    } else if (key === "parentId1052" || type === "crm_entity") {
      window.BX24.callMethod(
        "crm.item.get",
        { entityTypeId: 1052, id: num },
        (res) => {
          if (!res.error()) {
            const item = res.data()?.item || res.data();
            const title = item?.title || item?.TITLE || res.data()?.TITLE;
            if (title) {
              entityTitleCache[cacheKey] = title;
              callback(title);
            }
          }
        },
      );
    }
  }

  function findFieldConfig(key) {
    if (!CONFIG.sections) return null;
    for (const sec of CONFIG.sections) {
      const found = sec.fields.find((f) => f.key === key || f.crmCode === key);
      if (found) return found;
    }
    return null;
  }

  function getFieldValue(f, item) {
    if (!item) return undefined;
    const candidates = [f.key, f.crmCode, ...(f.fallbackKeys || [])].filter(
      Boolean,
    );

    for (const key of candidates) {
      if (item[key] !== undefined && item[key] !== null && item[key] !== "") {
        const val = item[key];
        // If lookup field has '0' or 0, continue to fallback
        if (
          (f.type === "crm_company" || f.key === "companyId") &&
          (val === 0 || val === "0")
        ) {
          continue;
        }
        // If file field has an empty array [], continue to fallback
        if (f.type === "file" && Array.isArray(val) && val.length === 0) {
          continue;
        }
        if (typeof val === "object" && val !== null) {
          if (f.type === "url" || f.key === "ufCrm16QrCodeLink") {
            const u = val.url || val.showUrl || val.src || val.defaultUrl;
            if (u) return u;
          }
          if (val.title || val.name || val.value) {
            return val.title || val.name || val.value;
          }
        }
        return val;
      }
      // Case-insensitive match fallback
      const lower = key.toLowerCase();
      const matchKey = Object.keys(item).find((k) => k.toLowerCase() === lower);
      if (
        matchKey &&
        item[matchKey] !== undefined &&
        item[matchKey] !== null &&
        item[matchKey] !== ""
      ) {
        const val = item[matchKey];
        if (
          (f.type === "crm_company" || f.key === "companyId") &&
          (val === 0 || val === "0")
        ) {
          continue;
        }
        if (f.type === "file" && Array.isArray(val) && val.length === 0) {
          continue;
        }
        if (typeof val === "object" && val !== null) {
          if (f.type === "url" || f.key === "ufCrm16QrCodeLink") {
            const u = val.url || val.showUrl || val.src || val.defaultUrl;
            if (u) return u;
          }
          if (val.title || val.name || val.value) {
            return val.title || val.name || val.value;
          }
        }
        return val;
      }
    }
    return undefined;
  }

  function cleanNumericValue(val) {
    if (val === null || val === undefined || val === "") return "";
    if (typeof val === "number") return val;
    const str = String(val).split("|")[0].trim();
    return str.replace(/[^\d.-]/g, "");
  }

  function formatDateForInput(val) {
    if (!val) return "";
    const str = String(val).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
      return str.slice(0, 10);
    }
    if (/^\d{2}\.\d{2}\.\d{4}/.test(str)) {
      const parts = str.split(".");
      return `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
    }
    if (/^\d{2}\/\d{2}\/\d{4}/.test(str)) {
      const parts = str.split("/");
      return `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
    }
    if (/^\d{10,13}$/.test(str)) {
      const d = new Date(Number(str.length === 10 ? str * 1000 : str));
      if (!isNaN(d.getTime())) {
        return d.toISOString().slice(0, 10);
      }
    }
    return str.slice(0, 10);
  }

  // ============================================================================
  // 6c. AUTO-CALCULATION & FIELD AUTOMATION ENGINE
  // ============================================================================
  function runListingAutomations(options = {}) {
    const isInitialLoad = !!options.isInitialLoad;
    const trigger = options.triggerField || "";

    const getEl = (id) => document.getElementById(`field_${id}`);
    const getVal = (id) => {
      const el = getEl(id);
      if (!el) return "";
      if (id === "ufCrm16ProjectName")
        return el.value !== undefined ? String(el.value).trim() : "";
      if (el.dataset && el.dataset.id !== undefined && el.dataset.id !== "")
        return el.dataset.id;
      return el.value !== undefined ? String(el.value).trim() : "";
    };

    const getNum = (id) => {
      const val = getVal(id);
      if (!val) return 0;
      const clean = String(val)
        .split("|")[0]
        .replace(/[^\d.-]/g, "");
      const num = parseFloat(clean);
      return isNaN(num) ? 0 : num;
    };

    const getText = (id) => {
      const el = getEl(id);
      if (!el) return "";
      if (el.tagName === "SELECT") {
        const selected = el.options[el.selectedIndex];
        return selected && selected.value ? selected.textContent.trim() : "";
      }
      return el.value !== undefined ? String(el.value).trim() : "";
    };

    const setVal = (id, newVal, markDirty = true) => {
      const el = getEl(id);
      if (!el) return false;
      const currentVal = el.value !== undefined ? String(el.value).trim() : "";
      const formattedNew = String(
        newVal !== null && newVal !== undefined ? newVal : "",
      ).trim();
      if (currentVal !== formattedNew) {
        el.value = formattedNew;
        if (el.dataset) el.dataset.id = formattedNew;
        if (isInitialLoad) {
          initialFormValues[id] = formattedNew;
        } else if (markDirty) {
          setDirty(true);
        }
        return true;
      }
      return false;
    };

    // 1. AUTO-CALCULATION: Price Per Sq Ft = Listing Price / Built-up Area
    const price = getNum("ufCrm16_1790154936");
    const sqft = getNum("ufCrm16SqFt");
    const pricePerSqFt = getNum("ufCrm16ListPricePerSqFt");

    if (price > 0 && sqft > 0) {
      if (
        !pricePerSqFt ||
        isInitialLoad ||
        trigger === "ufCrm16_1790154936" ||
        trigger === "ufCrm16SqFt"
      ) {
        const calcPricePerSqFt = (price / sqft).toFixed(2);
        setVal("ufCrm16ListPricePerSqFt", calcPricePerSqFt, !isInitialLoad);
      }
    } else if (
      trigger === "ufCrm16ListPricePerSqFt" &&
      pricePerSqFt > 0 &&
      sqft > 0 &&
      (!price || price === 0)
    ) {
      const calcPrice = Math.round(pricePerSqFt * sqft);
      setVal("ufCrm16_1790154936", calcPrice, true);
    }

    // 2. FIELD MIRRORING: Project Name <-> Bayut Building Name
    const projName = getVal("ufCrm16ProjectName");
    const bayutBuilding = getVal("ufCrm16BuildingBayut");
    if (projName && !bayutBuilding) {
      setVal("ufCrm16BuildingBayut", projName, !isInitialLoad);
    } else if (bayutBuilding && !projName) {
      setVal("ufCrm16ProjectName", bayutBuilding, !isInitialLoad);
    }

    // 3. FIELD MIRRORING: Community <-> Propertyfinder Community
    const community = getVal("ufCrm16_1791173032");
    const pfCommunity = getVal("ufCrm16CommunityPropertyfinder");
    if (community && !pfCommunity) {
      setVal("ufCrm16CommunityPropertyfinder", community, !isInitialLoad);
    } else if (pfCommunity && !community) {
      setVal("ufCrm16_1791173032", pfCommunity, !isInitialLoad);
    }

    // 4. FIELD DERIVATION: Composite Title strictly from actual non-empty record fields
    const beds = getVal("ufCrm16_1791172802");
    const propType = getText("ufCrm16PropertyType");
    const activeProject =
      getText("ufCrm16ProjectName") || getVal("ufCrm16BuildingBayut");
    const activeCommunity =
      getVal("ufCrm16_1791173032") || getVal("ufCrm16CommunityPropertyfinder");
    const city = getVal("ufCrm16_1791172815");

    if (propType) {
      let bedPrefix = "";
      if (beds === "0" || String(beds).toLowerCase() === "studio") {
        bedPrefix = "Studio";
      } else if (beds) {
        bedPrefix = `${beds} BR`;
      }

      const locParts = [activeProject, activeCommunity, city].filter(Boolean);
      const locStr = locParts.length > 0 ? ` in ${locParts.join(", ")}` : "";
      const autoTitle =
        [bedPrefix, propType].filter(Boolean).join(" ") + locStr;

      const currentTitle = getVal("title");
      const currentPortalTitle = getVal("ufCrm16SummaryDescription");

      if (!currentTitle || currentTitle.toLowerCase().startsWith("untitled")) {
        setVal("title", autoTitle, !isInitialLoad);
      }
      if (!currentPortalTitle) {
        setVal("ufCrm16SummaryDescription", autoTitle, !isInitialLoad);
      }
    }

    // 5. FIELD DERIVATION: Address strictly from actual non-empty record fields
    const currentAddress = getVal("ufCrm16_1791172676");
    const unitNo = getVal("ufCrm16UnitNumber");
    const street = getVal("ufCrm16Street");
    if (
      !currentAddress &&
      (unitNo || activeProject || activeCommunity || street)
    ) {
      const addrParts = [
        unitNo ? `Unit ${unitNo}` : "",
        activeProject,
        street,
        activeCommunity,
        city,
      ].filter(Boolean);
      if (addrParts.length > 0) {
        setVal("ufCrm16_1791172676", addrParts.join(", "), !isInitialLoad);
      }
    }
  }

  function renderLookupField(f, rawVal, group, displayLabel) {
    const entity = f.lookupEntity || resolveLookupEntity(f);
    f.lookupEntity = entity;
    const meta = getEntityMeta(f.type, f.key);

    const container = document.createElement("div");
    container.className = "lookup-container";

    const wrap = document.createElement("div");
    wrap.className = "lookup-input-wrap";

    const icon = document.createElement("span");
    icon.className = "lookup-icon";
    icon.textContent = "🔍";

    const input = document.createElement("input");
    input.id = `field_${f.key}`;
    input.name = f.key;
    input.type = "text";
    input.className = "form-control";
    input.placeholder = f.placeholder || `Search ${displayLabel}...`;
    input.autocomplete = "off";

    let rawIdStr = "";
    if (Array.isArray(rawVal)) {
      rawIdStr = rawVal
        .map((v) =>
          typeof v === "object" ? v.id || v.ID || JSON.stringify(v) : v,
        )
        .join(", ");
    } else if (rawVal && typeof rawVal === "object") {
      rawIdStr = String(rawVal.id || rawVal.ID || rawVal.value || "");
    } else if (rawVal !== null && rawVal !== undefined) {
      rawIdStr = String(rawVal).replace(/^#/, "");
    }

    // Check if known title is already present on listing object
    let knownTitle = "";
    if (rawVal && typeof rawVal === "object" && (rawVal.title || rawVal.name)) {
      knownTitle = rawVal.title || rawVal.name;
    } else if (f.key === "companyId" && currentListing.company?.title) {
      knownTitle = currentListing.company.title;
    } else if (f.key === "contactId" && currentListing.contact?.name) {
      knownTitle = currentListing.contact.name;
    } else if (f.key === "assignedById" && currentListing.assignedBy?.name) {
      knownTitle = currentListing.assignedBy.name;
    } else if (f.key === "parentId1052" && currentListing.parentId1052?.title) {
      knownTitle = currentListing.parentId1052.title;
    } else if (
      (f.key === "ufCrm16MasterProject" || f.key === "ufCrm16_1791173000") &&
      currentListing.ufCrm16MasterProjectInfo
    ) {
      knownTitle = currentListing.ufCrm16MasterProjectInfo;
    } else if (currentListing[`${f.key}_TITLE`]) {
      knownTitle = currentListing[`${f.key}_TITLE`];
    } else if (currentListing[`${f.key}_NAME`]) {
      knownTitle = currentListing[`${f.key}_NAME`];
    }

    const cleanId = rawIdStr
      .replace(/^[A-Z]+_/, "")
      .replace(/^DYNAMIC_\d+_/, "")
      .replace(/^#/, "")
      .trim();
    const isNumericId = /^\d+$/.test(cleanId) && cleanId !== "0";
    const hasValidId = isNumericId;

    if (knownTitle) {
      input.value = knownTitle;
      input.title = `${knownTitle} (ID: ${cleanId || rawIdStr})`;
      input.dataset.selectedId = cleanId || rawIdStr;
      input.dataset.selectedRef = rawIdStr;
      input.dataset.selectedTitle = knownTitle;
      input.dataset.id = cleanId || rawIdStr;
    } else if (hasValidId) {
      input.value = `#${cleanId}`;
      input.title = `${meta.label} ID: ${cleanId}`;
      input.dataset.selectedId = cleanId;
      input.dataset.selectedRef = rawIdStr;
      input.dataset.id = cleanId;
    } else if (rawVal && typeof rawVal === "string" && rawVal.trim()) {
      const plainTitle = rawVal.trim();
      input.value = plainTitle;
      input.title = plainTitle;
      input.dataset.selectedTitle = plainTitle;
      input.dataset.id = f.key === "ufCrm16ProjectName" ? plainTitle : "";
      // Pre-resolve ID & CRM ref in background by title
      fetch(
        `/api/lookup?entity=${encodeURIComponent(entity)}&q=${encodeURIComponent(plainTitle)}`,
        {
          headers: getCrmAuthHeaders(),
        },
      )
        .then((r) => r.json())
        .then((d) => {
          const match = (d.items || []).find(
            (it) =>
              it.title && it.title.toLowerCase() === plainTitle.toLowerCase(),
          );
          if (match && input.value === plainTitle) {
            input.dataset.selectedId = String(match.id);
            input.dataset.selectedRef = match.crmRef || match.id;
            input.dataset.selectedTitle = match.title;
            if (f.key !== "ufCrm16ProjectName")
              input.dataset.id = String(match.id);
            input.title = `${match.title} (ID: ${match.id})`;
            openBtn.style.display = "inline-flex";
          }
        })
        .catch(() => {});
    } else {
      input.value = "";
      input.dataset.id = "";
      input.dataset.selectedId = "";
      input.dataset.selectedRef = "";
    }

    const clearBtn = document.createElement("button");
    clearBtn.type = "button";
    clearBtn.className = "lookup-clear-btn";
    clearBtn.innerHTML = "&times;";
    clearBtn.title = "Clear selection";
    clearBtn.style.display = input.value ? "block" : "none";

    // Open button: arrow only!
    const openBtn = document.createElement("button");
    openBtn.type = "button";
    openBtn.className = "lookup-open-btn";
    openBtn.innerHTML = `<span>↗</span>`;
    openBtn.title = `Open linked ${meta.label} in Bitrix24`;
    openBtn.style.display =
      hasValidId || input.dataset.selectedId || input.dataset.selectedRef
        ? "inline-flex"
        : "none";

    // Fetch title in background via /api/lookup or Bitrix fallback
    if (hasValidId && !knownTitle) {
      fetch(
        `/api/lookup?entity=${encodeURIComponent(entity)}&q=${encodeURIComponent(cleanId)}`,
        {
          headers: getCrmAuthHeaders(),
        },
      )
        .then((r) => r.json())
        .then((d) => {
          const match = (d.items || []).find(
            (it) => String(it.id) === cleanId || it.crmRef === rawIdStr,
          );
          if (
            match &&
            (input.dataset.id === cleanId ||
              !input.value ||
              input.value === `#${cleanId}`)
          ) {
            input.value = match.title;
            input.title = `${match.title} (ID: ${cleanId})`;
            input.dataset.selectedRef = match.crmRef || rawIdStr;
            input.dataset.selectedTitle = match.title;
            input.dataset.selectedId = String(match.id);
            input.dataset.id = String(match.id);
            clearBtn.style.display = "block";
            openBtn.style.display = "inline-flex";
            if (f.key === "ufCrm16_1791172932" || f.key === "companyId") {
              const devNameInput = document.getElementById(
                "field_ufCrm16DeveloperName",
              );
              if (devNameInput && !devNameInput.value) {
                devNameInput.value = match.title;
              }
            }
          }
        })
        .catch(() => {
          fetchEntityTitle(f.type, cleanId, f.key, (resolvedTitle) => {
            if (
              resolvedTitle &&
              (input.dataset.id === cleanId ||
                !input.value ||
                input.value === `#${cleanId}`)
            ) {
              input.value = resolvedTitle;
              input.title = `${resolvedTitle} (ID: ${cleanId})`;
              input.dataset.selectedTitle = resolvedTitle;
              clearBtn.style.display = "block";
              openBtn.style.display = "inline-flex";
            }
          });
        });
    }

    const dropdown = document.createElement("div");
    dropdown.className = "lookup-dropdown";

    wrap.appendChild(icon);
    wrap.appendChild(input);
    wrap.appendChild(clearBtn);
    wrap.appendChild(openBtn);
    container.appendChild(wrap);
    container.appendChild(dropdown);

    let debounceTimer = null;

    function closeDropdown() {
      dropdown.style.display = "none";
      dropdown.classList.remove("dropup");
      container.classList.remove("has-open-dropdown");
      group.classList.remove("has-open-dropdown");
      const card = container.closest(".section-card");
      if (card) card.classList.remove("has-open-dropdown");
    }

    function adjustDropdownPosition() {
      const rect = wrap.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      if (spaceBelow < 250 && spaceAbove > spaceBelow) {
        dropdown.classList.add("dropup");
      } else {
        dropdown.classList.remove("dropup");
      }
    }

    function openDropdown() {
      adjustDropdownPosition();
      dropdown.style.display = "block";
      container.classList.add("has-open-dropdown");
      group.classList.add("has-open-dropdown");
      const card = container.closest(".section-card");
      if (card) card.classList.add("has-open-dropdown");
    }

    async function queryLookup(query = "", refresh = false) {
      dropdown.innerHTML =
        '<div class="lookup-spinner">Searching Bitrix24 records...</div>';
      openDropdown();

      try {
        const cleanQuery = String(query).replace(/^#/, "").trim();
        const refreshParam = refresh ? "&refresh=1" : "";
        const res = await fetch(
          `/api/lookup?entity=${encodeURIComponent(entity)}&q=${encodeURIComponent(cleanQuery)}${refreshParam}`,
          {
            headers: getCrmAuthHeaders(),
          },
        );
        const data = await res.json();
        const items = data.items || [];

        dropdown.innerHTML = "";

        const header = document.createElement("div");
        header.className = "lookup-dropdown-header";
        header.innerHTML = `<span>${items.length} records</span><button type="button" class="lookup-refresh-btn" title="Refresh records from Bitrix24">🔄 Refresh</button>`;
        const refreshBtnEl = header.querySelector(".lookup-refresh-btn");
        if (refreshBtnEl) {
          refreshBtnEl.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            queryLookup(input.value.trim(), true);
          });
        }
        dropdown.appendChild(header);

        if (items.length === 0) {
          const empty = document.createElement("div");
          empty.className = "lookup-item";
          empty.style.cssText = "color: #828b95; cursor: default;";
          empty.textContent = "No matching records found";
          dropdown.appendChild(empty);
          adjustDropdownPosition();
          return;
        }

        items.forEach((item) => {
          const itemEl = document.createElement("div");
          itemEl.className = "lookup-item";

          const titleSpan = document.createElement("span");
          titleSpan.className = "lookup-item-title";
          titleSpan.textContent = item.title;

          const idSpan = document.createElement("span");
          idSpan.className = "lookup-item-id";
          idSpan.textContent = `#${item.id}`;

          itemEl.appendChild(titleSpan);
          itemEl.appendChild(idSpan);

          itemEl.addEventListener("click", () => {
            input.value = item.title;
            input.dataset.id = String(item.id);
            input.dataset.selectedId = String(item.id);
            input.dataset.selectedTitle = item.title;
            input.dataset.selectedRef = item.crmRef || item.id;
            input.title = `${item.title} (ID: ${item.id})`;
            clearBtn.style.display = "block";
            openBtn.style.display = "inline-flex";
            closeDropdown();

            // Auto-populate companion fields
            if (
              (f.key === "companyId" || f.key === "ufCrm16_1791172932") &&
              item.title
            ) {
              const devNameInput = document.getElementById(
                "field_ufCrm16DeveloperName",
              );
              if (devNameInput) devNameInput.value = item.title;
            }
            if (
              (f.key === "ufCrm16ProjectName" ||
                f.key === "ufCrm16_1791173131") &&
              item.title
            ) {
              const bayutInput = document.getElementById(
                "field_ufCrm16BuildingBayut",
              );
              if (bayutInput && !bayutInput.value)
                bayutInput.value = item.title;

              // Auto-link Master Project if Project has a parent Master Project (parentId1040)
              if (item.parentId1040) {
                const mpInput =
                  document.getElementById("field_ufCrm16MasterProject") ||
                  document.getElementById("field_ufCrm16_1791173000");
                if (
                  mpInput &&
                  (!mpInput.value || !mpInput.dataset.selectedId)
                ) {
                  fetch(
                    `/api/lookup?entity=master_project&q=${item.parentId1040}`,
                    {
                      headers: getCrmAuthHeaders(),
                    },
                  )
                    .then((r) => r.json())
                    .then((d) => {
                      const mpMatch = (d.items || []).find(
                        (it) => String(it.id) === String(item.parentId1040),
                      );
                      if (mpMatch && mpInput) {
                        mpInput.value = mpMatch.title;
                        mpInput.dataset.selectedId = String(mpMatch.id);
                        mpInput.dataset.selectedRef =
                          mpMatch.crmRef || String(mpMatch.id);
                        mpInput.dataset.selectedTitle = mpMatch.title;
                        mpInput.dataset.id = String(mpMatch.id);
                        mpInput.title = `${mpMatch.title} (ID: ${mpMatch.id})`;
                        const mpClear =
                          mpInput.parentElement?.querySelector(
                            ".lookup-clear-btn",
                          );
                        const mpOpen =
                          mpInput.parentElement?.querySelector(
                            ".lookup-open-btn",
                          );
                        if (mpClear) mpClear.style.display = "block";
                        if (mpOpen) mpOpen.style.display = "inline-flex";
                      }
                    })
                    .catch(() => {});
                }
              }
            }

            setDirty(true);
            runListingAutomations({
              isInitialLoad: false,
              triggerField: f.key,
            });
          });

          dropdown.appendChild(itemEl);
        });
        adjustDropdownPosition();
      } catch (err) {
        dropdown.innerHTML =
          '<div class="lookup-item" style="color: var(--danger);">Failed to load records</div>';
        adjustDropdownPosition();
      }
    }

    input.addEventListener("focus", () => {
      const cleanVal = input.value.replace(/^#/, "").trim();
      queryLookup(cleanVal);
    });

    input.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        closeDropdown();
      } else if (e.key === "Enter") {
        e.preventDefault();
        const firstItem = dropdown.querySelector(
          '.lookup-item:not([style*="cursor: default"])',
        );
        if (firstItem) {
          firstItem.click();
        } else {
          closeDropdown();
        }
      }
    });

    input.addEventListener("input", () => {
      const val = input.value.trim();
      clearBtn.style.display = val ? "block" : "none";

      if (!val) {
        input.dataset.id = "";
        input.dataset.selectedId = "";
        input.dataset.selectedRef = "";
        input.dataset.selectedTitle = "";
        input.title = "";
        openBtn.style.display = "none";
        closeDropdown();

        if (f.key === "companyId" || f.key === "ufCrm16_1791172932") {
          const devNameInput = document.getElementById(
            "field_ufCrm16DeveloperName",
          );
          if (devNameInput) devNameInput.value = "";
        }
      } else {
        if (
          input.dataset.selectedTitle &&
          input.dataset.selectedTitle !== val
        ) {
          input.dataset.selectedId = "";
          input.dataset.selectedRef = "";
          openBtn.style.display = "none";
        }
        const numMatch = val.match(/^#?(\d+)$/);
        if (numMatch) {
          input.dataset.id = numMatch[1];
          input.dataset.selectedId = numMatch[1];
          openBtn.style.display = "inline-flex";
        } else if (f.key === "ufCrm16ProjectName") {
          input.dataset.id = val;
        } else {
          input.dataset.id = "";
        }
      }

      setDirty(true);

      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        const cleanQ = val.replace(/^#/, "").trim();
        queryLookup(cleanQ);
      }, 250);
      runListingAutomations({ isInitialLoad: false, triggerField: f.key });
    });

    clearBtn.addEventListener("click", () => {
      input.value = "";
      input.dataset.id = "";
      input.dataset.selectedId = "";
      input.dataset.selectedRef = "";
      input.dataset.selectedTitle = "";
      input.title = "";
      clearBtn.style.display = "none";
      openBtn.style.display = "none";
      closeDropdown();

      if (f.key === "companyId" || f.key === "ufCrm16_1791172932") {
        const devNameInput = document.getElementById(
          "field_ufCrm16DeveloperName",
        );
        if (devNameInput) devNameInput.value = "";
      }

      setDirty(true);
      runListingAutomations({ isInitialLoad: false, triggerField: f.key });
      input.focus();
    });

    openBtn.addEventListener("click", (e) => {
      const currentTargetId =
        input.dataset.selectedRef ||
        input.dataset.selectedId ||
        input.dataset.id;
      if (!currentTargetId) {
        showToast(`Please select a valid ${meta.label} first`, "warning");
        return;
      }
      const firstId = currentTargetId.includes(",")
        ? currentTargetId.split(",")[0].trim()
        : currentTargetId;
      openLinkedRecord(f.type, firstId, f.key, e);
    });

    document.addEventListener("click", (e) => {
      if (!container.contains(e.target)) {
        closeDropdown();
      }
    });

    group.appendChild(container);
    initialFormValues[f.key] = input.dataset.id || input.value;
  }

  // Field element factory
  function createFieldElement(f, layoutKey) {
    const group = document.createElement("div");
    group.className = `field-group ${f.fullWidth ? "full-width" : ""}`;
    group.setAttribute("data-field-key", f.key);

    const displayLabel = f.labelOverrides?.[layoutKey] || f.label;
    const labelEl = document.createElement("label");
    labelEl.className = "field-label";
    labelEl.setAttribute("for", `field_${f.key}`);
    labelEl.innerHTML = `
      <span>${displayLabel}</span>
      ${f.labelOverrides?.[layoutKey] ? `<span class="field-context-hint">${layoutKey.replace("_", " ")}</span>` : ""}
    `;
    group.appendChild(labelEl);

    const rawVal = getFieldValue(f, currentListing);

    if (f.type === "file") {
      renderMediaField(f, rawVal, group);
    } else if (isLookupField(f)) {
      renderLookupField(f, rawVal, group, displayLabel);
    } else if (f.type === "tour_url") {
      const card = document.createElement("div");
      card.className = "file-upload-card media-url-card";

      const wrap = document.createElement("div");
      wrap.className = "media-url-input-wrap";

      const input = document.createElement("input");
      input.type = "url";
      input.id = `field_${f.key}`;
      input.name = f.key;
      input.className = "form-control";
      input.placeholder =
        f.placeholder || "https://my.matterport.com/show/?m=...";
      input.value = rawVal || "";
      input.addEventListener("input", () => {
        setDirty(true);
        runListingAutomations({ isInitialLoad: false, triggerField: f.key });
      });

      const launchBtn = document.createElement("button");
      launchBtn.type = "button";
      launchBtn.className = "btn btn-secondary launch-tour-btn";
      launchBtn.innerHTML = `<span>🌐 Launch 360</span>`;
      launchBtn.title = "Open interactive 360 tour preview";
      launchBtn.addEventListener("click", () => {
        if (!input.value) {
          showToast("Please enter a 360 Virtual Tour URL first", "warning");
          return;
        }
        openLightbox("360 Virtual Tour Preview", input.value, true);
      });

      wrap.appendChild(input);
      wrap.appendChild(launchBtn);
      card.appendChild(wrap);
      group.appendChild(card);
      initialFormValues[f.key] = input.value;
    } else if (f.type === "url") {
      const card = document.createElement("div");
      card.className = "file-upload-card media-url-card";

      const wrap = document.createElement("div");
      wrap.className = "media-url-input-wrap";

      const input = document.createElement("input");
      input.type = "url";
      input.id = `field_${f.key}`;
      input.name = f.key;
      input.className = "form-control";
      input.placeholder = f.placeholder || "https://...";
      input.value = rawVal || "";
      input.addEventListener("input", () => {
        setDirty(true);
        runListingAutomations({ isInitialLoad: false, triggerField: f.key });
      });

      const testBtn = document.createElement("a");
      testBtn.href = rawVal || "#";
      testBtn.target = "_self";
      testBtn.className = "btn btn-secondary launch-tour-btn";
      testBtn.textContent = "↗ Open";
      testBtn.addEventListener("click", (e) => {
        if (!input.value) e.preventDefault();
        else openLightbox("Preview", input.value, true);
      });

      wrap.appendChild(input);
      wrap.appendChild(testBtn);
      card.appendChild(wrap);
      group.appendChild(card);
      initialFormValues[f.key] = input.value;
    } else if (f.type === "textarea") {
      const textarea = document.createElement("textarea");
      textarea.id = `field_${f.key}`;
      textarea.name = f.key;
      textarea.className = "form-control";
      textarea.placeholder = f.placeholder || "";
      textarea.value = rawVal !== null && rawVal !== undefined ? rawVal : "";
      textarea.rows = 2;
      textarea.addEventListener("input", () => {
        setDirty(true);
        runListingAutomations({ isInitialLoad: false, triggerField: f.key });
      });
      group.appendChild(textarea);
      initialFormValues[f.key] = textarea.value;
    } else if (f.type === "enumeration" || f.type === "stage") {
      const select = document.createElement("select");
      select.id = `field_${f.key}`;
      select.name = f.key;
      select.className = "form-control";

      const defOpt = document.createElement("option");
      defOpt.value = "";
      defOpt.textContent = `-- Select ${displayLabel} --`;
      select.appendChild(defOpt);

      const rawStr =
        rawVal !== null && rawVal !== undefined
          ? String(rawVal).trim().toLowerCase()
          : "";
      let options = f.options ? [...f.options] : [];

      if (f.type === "stage") {
        const pipelineId =
          currentListing?.categoryId !== undefined &&
          currentListing?.categoryId !== null
            ? currentListing.categoryId
            : currentListing?.CATEGORY_ID !== undefined &&
                currentListing?.CATEGORY_ID !== null
              ? currentListing.CATEGORY_ID
              : 0;
        const pipeKey = `pipe_${pipelineId}`;
        if (
          stageOptionsByPipeline[pipeKey] &&
          stageOptionsByPipeline[pipeKey].length > 0
        ) {
          options = stageOptionsByPipeline[pipeKey];
        }
      }

      // If record has an existing stage value, preserve it in the picklist
      if (
        rawVal &&
        !options.some(
          (opt) =>
            String(opt.id).trim().toLowerCase() === rawStr ||
            String(opt.value).trim().toLowerCase() === rawStr,
        )
      ) {
        options.unshift({ id: String(rawVal), value: String(rawVal) });
      }

      options.forEach((opt) => {
        const optionEl = document.createElement("option");
        optionEl.value = opt.id;
        optionEl.textContent = opt.value;
        const optIdStr = String(opt.id).trim().toLowerCase();
        const optValStr = String(opt.value).trim().toLowerCase();
        if (rawStr && (rawStr === optIdStr || rawStr === optValStr)) {
          optionEl.selected = true;
        }
        select.appendChild(optionEl);
      });

      // Special: When Listing Type is changed in General section, adapt layout dynamically!
      if (f.key === CONFIG.layoutField) {
        select.addEventListener("change", () => {
          const selectedEnumId = select.value;
          const mappedLayout = CONFIG.layoutEnumMap[selectedEnumId] || "rent";
          showToast(
            `Layout updated to ${CONFIG.layoutMeta[mappedLayout].title}`,
            "info",
          );
          currentListing[f.key] = selectedEnumId;
          renderLayout(mappedLayout);
          setDirty(true);
          runListingAutomations({ isInitialLoad: false, triggerField: f.key });
        });
      } else {
        select.addEventListener("change", () => {
          setDirty(true);
          runListingAutomations({ isInitialLoad: false, triggerField: f.key });
        });
      }

      group.appendChild(select);
      initialFormValues[f.key] = select.value;
    } else if (f.type === "boolean") {
      const select = document.createElement("select");
      select.id = `field_${f.key}`;
      select.name = f.key;
      select.className = "form-control";
      select.innerHTML = `
        <option value="">-- Select --</option>
        <option value="Y" ${rawVal === "Y" || rawVal === true || rawVal === 1 ? "selected" : ""}>Yes</option>
        <option value="N" ${rawVal === "N" || rawVal === false || rawVal === 0 ? "selected" : ""}>No</option>
      `;
      select.addEventListener("change", () => {
        setDirty(true);
        runListingAutomations({ isInitialLoad: false, triggerField: f.key });
      });
      group.appendChild(select);
      initialFormValues[f.key] = select.value;
    } else if (f.type === "address") {
      const input = document.createElement("input");
      input.id = `field_${f.key}`;
      input.name = f.key;
      input.type = "text";
      input.className = "form-control";
      input.placeholder = f.placeholder || "Street, building, area...";
      if (rawVal && typeof rawVal === "object") {
        input.value =
          rawVal.text ||
          rawVal.street ||
          Object.values(rawVal)
            .filter((v) => typeof v === "string")
            .join(", ") ||
          "";
      } else {
        input.value = rawVal !== null && rawVal !== undefined ? rawVal : "";
      }
      input.addEventListener("input", () => {
        setDirty(true);
        runListingAutomations({ isInitialLoad: false, triggerField: f.key });
      });
      group.appendChild(input);
      initialFormValues[f.key] = input.value;
    } else if (
      f.type === "number" ||
      f.type === "money" ||
      f.type === "integer"
    ) {
      const isAddon = !!f.addon;
      const input = document.createElement("input");
      input.id = `field_${f.key}`;
      input.name = f.key;
      input.type = "number";
      input.step = f.type === "integer" ? "1" : "any";
      input.className = "form-control";
      input.placeholder = f.placeholder || "";
      input.value = cleanNumericValue(rawVal);
      input.addEventListener("input", () => {
        setDirty(true);
        runListingAutomations({ isInitialLoad: false, triggerField: f.key });
      });
      input.addEventListener("change", () => {
        setDirty(true);
        runListingAutomations({ isInitialLoad: false, triggerField: f.key });
      });

      if (isAddon) {
        const addonWrap = document.createElement("div");
        addonWrap.className = "input-addon-group";
        addonWrap.appendChild(input);
        const addonSpan = document.createElement("span");
        addonSpan.className = "input-addon";
        addonSpan.textContent = f.addon;
        addonWrap.appendChild(addonSpan);
        group.appendChild(addonWrap);
      } else {
        group.appendChild(input);
      }
      initialFormValues[f.key] = input.value;
    } else if (f.type === "date") {
      const input = document.createElement("input");
      input.id = `field_${f.key}`;
      input.name = f.key;
      input.type = "date";
      input.className = "form-control";
      input.value = formatDateForInput(rawVal);
      input.addEventListener("input", () => {
        setDirty(true);
        runListingAutomations({ isInitialLoad: false, triggerField: f.key });
      });
      input.addEventListener("change", () => {
        setDirty(true);
        runListingAutomations({ isInitialLoad: false, triggerField: f.key });
      });
      group.appendChild(input);
      initialFormValues[f.key] = input.value;
    } else {
      const isAddon = !!f.addon;
      const input = document.createElement("input");
      input.id = `field_${f.key}`;
      input.name = f.key;
      input.type = "text";
      input.className = "form-control";
      input.placeholder = f.placeholder || "";

      let displayVal = rawVal;
      if (
        displayVal !== null &&
        displayVal !== undefined &&
        typeof displayVal === "object"
      ) {
        displayVal =
          displayVal.title ||
          displayVal.name ||
          displayVal.id ||
          displayVal.value ||
          "";
      }
      input.value =
        displayVal !== null && displayVal !== undefined ? displayVal : "";
      input.addEventListener("input", () => {
        setDirty(true);
        runListingAutomations({ isInitialLoad: false, triggerField: f.key });
      });
      input.addEventListener("change", () => {
        setDirty(true);
        runListingAutomations({ isInitialLoad: false, triggerField: f.key });
      });

      if (isAddon) {
        const addonWrap = document.createElement("div");
        addonWrap.className = "input-addon-group";
        addonWrap.appendChild(input);
        const addonSpan = document.createElement("span");
        addonSpan.className = "input-addon";
        addonSpan.textContent = f.addon;
        addonWrap.appendChild(addonSpan);
        group.appendChild(addonWrap);
      } else {
        group.appendChild(input);
      }
      initialFormValues[f.key] = input.value;
    }

    return group;
  }

  // ============================================================================
  // 7. EVENT LISTENERS
  // ============================================================================
  // Search Filter
  searchInput.addEventListener("input", () => {
    const q = searchInput.value.toLowerCase().trim();
    clearSearchBtn.style.display = q ? "block" : "none";

    document.querySelectorAll(".field-group").forEach((group) => {
      const text = group.textContent.toLowerCase();
      group.style.display = !q || text.includes(q) ? "" : "none";
    });
  });

  clearSearchBtn.addEventListener("click", () => {
    searchInput.value = "";
    clearSearchBtn.style.display = "none";
    document.querySelectorAll(".field-group").forEach((group) => {
      group.style.display = "";
    });
  });

  // Toggle all sections
  toggleAllBtn.addEventListener("click", () => {
    allSectionsCollapsed = !allSectionsCollapsed;
    document.querySelectorAll(".section-card").forEach((card) => {
      card.classList.toggle("collapsed", allSectionsCollapsed);
    });
    toggleAllBtn.textContent = allSectionsCollapsed
      ? "Expand All"
      : "Collapse All";
    scheduleResize(50);
  });

  // Refresh
  refreshBtn.addEventListener("click", () => {
    loadListingDetails();
  });

  // Cancel
  cancelBtn.addEventListener("click", () => {
    if (
      confirm("Discard all unsaved changes and reload original listing data?")
    ) {
      loadListingDetails();
    }
  });

  // Save changes
  formEl.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!currentListingId) return;

    saveBtn.disabled = true;
    saveBtn.innerHTML = "⏳ &nbsp;SAVING...";

    try {
      const payload = {};

      const formData = new FormData(formEl);
      for (const [key, val] of formData.entries()) {
        payload[key] = val;
      }

      document
        .querySelectorAll(
          "#sections-container input, #sections-container select, #sections-container textarea",
        )
        .forEach((el) => {
          if (el.name && el.type !== "file") {
            let fieldVal =
              el.dataset.id !== undefined && el.dataset.id !== ""
                ? el.dataset.id
                : el.value;
            const fConfig = findFieldConfig(el.name);
            if (
              fConfig &&
              (fConfig.key === "ufCrm16ProjectName" ||
                fConfig.crmCode === "UF_CRM_16_PROJECT_NAME")
            ) {
              fieldVal = el.value.trim();
            } else if (fConfig && isLookupField(fConfig)) {
              const selectedId = el.dataset.selectedId || el.dataset.id;
              const isNumeric = /^\d+$/.test(String(selectedId || "").trim());
              if (isNumeric) {
                fieldVal = selectedId;
              } else if (
                el.name === "companyId" ||
                el.name === "parentId1052" ||
                el.name === "contactId" ||
                el.name === "assignedById"
              ) {
                fieldVal = 0;
              } else {
                fieldVal = selectedId || "";
              }
            } else if (
              fConfig &&
              fConfig.type === "money" &&
              fieldVal &&
              !String(fieldVal).includes("|")
            ) {
              const numPart = String(fieldVal).replace(/[^\d.-]/g, "");
              fieldVal = numPart ? `${numPart}|AED` : "";
            }
            payload[el.name] = fieldVal;
          }
        });

      // Synchronize developer companion field ufCrm16DeveloperName if needed
      if (payload["companyId"] && !payload["ufCrm16DeveloperName"]) {
        const compEl = document.getElementById("field_companyId");
        if (compEl?.value)
          payload["ufCrm16DeveloperName"] = compEl.value.trim();
      }

      // Synchronize Project & Master Project companion and native Bitrix CRM binding fields
      const projEl = document.getElementById("field_ufCrm16ProjectName");
      if (projEl) {
        payload["ufCrm16ProjectName"] = projEl.value.trim();
        payload["ufCrm16BuildingBayut"] =
          payload["ufCrm16BuildingBayut"] || projEl.value.trim();
        if (
          projEl.dataset.selectedId &&
          /^\d+$/.test(projEl.dataset.selectedId)
        ) {
          payload["ufCrm16_1791173131"] = projEl.dataset.selectedId;
        } else if (!projEl.value.trim()) {
          payload["ufCrm16_1791173131"] = 0;
        }
      }

      const mpEl = document.getElementById("field_ufCrm16MasterProject");
      if (mpEl) {
        if (mpEl.dataset.selectedId && /^\d+$/.test(mpEl.dataset.selectedId)) {
          payload["ufCrm16_1791173000"] = mpEl.dataset.selectedId;
          payload["ufCrm16MasterProjectInfo"] = mpEl.value.trim();
          payload["ufCrm16MasterProject"] = mpEl.dataset.selectedId;
        } else if (!mpEl.value.trim()) {
          payload["ufCrm16_1791173000"] = 0;
          payload["ufCrm16MasterProjectInfo"] = "";
          payload["ufCrm16MasterProject"] = "";
        }
      }

      if (
        payload["contactIds"] &&
        typeof payload["contactIds"] === "string" &&
        payload["contactIds"].includes(",")
      ) {
        payload["contactIds"] = payload["contactIds"]
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
      }

      // Package pending file uploads & removals
      const allFileFieldKeys = new Set([
        ...Object.keys(pendingFileUploads),
        ...Object.keys(removedFileIds),
      ]);

      for (const fieldKey of allFileFieldKeys) {
        const fileList = pendingFileUploads[fieldKey] || [];
        const removedSet = removedFileIds[fieldKey] || new Set();
        if (fileList.length === 0 && removedSet.size === 0) continue;

        const isMulti =
          fConfig?.isMultiple ||
          fieldKey.includes("1791881642219") ||
          fieldKey.includes("1791881665252") ||
          fieldKey.includes("1791544736052");

        if (isMulti) {
          // Bitrix REST API multiple file upload requires array of file IDs to keep + new [fileName, base64] tuples.
          const existingRaw =
            (fConfig ? getFieldValue(fConfig, currentListing) : null) ||
            currentListing?.[fieldKey] ||
            (fConfig?.crmCode ? currentListing?.[fConfig.crmCode] : null);
          const existingList = Array.isArray(existingRaw)
            ? existingRaw
            : existingRaw
              ? [existingRaw]
              : [];
          const keptIds = existingList
            .map((it) =>
              typeof it === "object" ? it.id || it.ID || it.fileId : it,
            )
            .filter(Boolean)
            .filter((id) => !removedSet.has(String(id)));

          const newTuples = fileList.map((item) => [
            item.name,
            item.dataUrl.split(",")[1] || "",
          ]);
          const combined = [...keptIds, ...newTuples];
          payload[fieldKey] = combined.length ? combined : [""];
        } else {
          // Single file field
          if (fileList.length > 0) {
            const item = fileList[0];
            const base64 = item.dataUrl.split(",")[1] || "";
            payload[fieldKey] = { fileData: [item.name, base64] };
          } else if (removedSet.size > 0) {
            // Delete existing single file in Bitrix CRM
            payload[fieldKey] = { del: "Y" };
          }
        }
      }

      console.log("[LISTING] Saving payload:", payload);
      await updateListing(currentListingId, payload);

      showToast("✓ Listing updated successfully in Bitrix24!", "success");
      pendingFileUploads = {};
      removedFileIds = {};
      setDirty(false);

      await loadListingDetails(false);
    } catch (err) {
      console.error("Failed to save listing:", err);
      showToast(`Save failed: ${err.message}`, "error");
    } finally {
      saveBtn.disabled = false;
      saveBtn.innerHTML = "✓ &nbsp;SAVE CHANGES";
    }
  });

  // ============================================================================
  // 8. INITIALIZATION
  // ============================================================================
  async function loadListingDetails(showLoader = true) {
    if (!isEmbeddedInCrm()) {
      console.warn(
        "[SECURITY] Standalone URL access blocked. App is only accessible inside Bitrix24 CRM.",
      );
      renderCrmLockoutScreen();
      return;
    }

    pendingFileUploads = {};
    removedFileIds = {};
    if (showLoader) {
      loadingEl.style.display = "flex";
      contentEl.style.display = "none";
    }

    try {
      currentListingId = resolveListingId();
      if (!currentListingId) {
        throw new Error(
          "No Listing ID detected. Open from Listing CRM detail card or pass ?ID=108",
        );
      }

      console.log(`[LISTING] Loading listing #${currentListingId}...`);
      currentListing = await fetchListing(currentListingId);
      console.log("[LISTING] Loaded item data:", currentListing);

      // Determine current pipeline (categoryId) strictly from the record
      const pipelineId =
        currentListing?.categoryId !== undefined &&
        currentListing?.categoryId !== null
          ? currentListing.categoryId
          : currentListing?.CATEGORY_ID !== undefined &&
              currentListing?.CATEGORY_ID !== null
            ? currentListing.CATEGORY_ID
            : 0;

      // Fetch stages strictly for the current pipeline
      const stages = await fetchStageOptions(pipelineId).catch(() => []);
      const stageF = findFieldConfig("stageId");
      if (stageF) {
        stageF.options = stages || [];
      }

      // Render strictly driven by the field value
      const layoutKey = detectLayoutFromListing(currentListing);
      renderLayout(layoutKey);

      // Execute auto-calculations and field automations each time record is opened!
      runListingAutomations({ isInitialLoad: true });

      setDirty(false);
      loadingEl.style.display = "none";
      contentEl.style.display = "block";
      scheduleResize(40);
      setTimeout(() => scheduleResize(300), 300);
    } catch (err) {
      console.error("[LISTING] Init error:", err);
      loadingEl.innerHTML = `
        <div style="text-align: center; color: var(--danger); max-width: 450px;">
          <div style="font-size: 28px; margin-bottom: 6px;">⚠️</div>
          <strong style="font-size: 13px; display: block; margin-bottom: 4px;">Unable to Load Listing</strong>
          <p style="font-size: 11px; color: var(--text-muted); margin-bottom: 12px;">${err.message}</p>
          <button type="button" class="btn btn-secondary" onclick="window.location.reload()">Retry</button>
        </div>
      `;
    }
  }

  // Export app instance for validation and testing
  window.__LISTING_DETAILS_APP__ = {
    CONFIG,
    detectLayoutFromListing,
    getCurrentListing: () => currentListing,
    getCurrentLayout: () => currentLayout,
    setLayout: (key) => renderLayout(key),
    getPendingUploads: () => pendingFileUploads,
    getRemovedFileIds: () => removedFileIds,
    openLightbox,
    closeLightbox,
    showInWindowImage,
    showInWindowPdf,
    openLinkedRecord,
    getEntityPath,
    isLookupField,
    getEntityMeta,
    runListingAutomations,
  };

  if (!isEmbeddedInCrm()) {
    renderCrmLockoutScreen();
  } else if (window.BX24) {
    window.BX24.init(() => loadListingDetails(true));
  } else {
    window.addEventListener("DOMContentLoaded", () => loadListingDetails(true));
  }
})();
