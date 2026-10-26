/**
 * scripts/build_sync_layout.js
 * Synchronizes Lead Listing Form Layout (listingLayout) with Listing Details SPA 1058 (listingDynamicLayout)
 * Ensures every field in both layouts is 1-to-1 mapped with:
 *  - Lead field code (UF_CRM_...)
 *  - SPA key (ufCrm16_... / native field)
 *  - SPA CRM code (UF_CRM_16_...)
 *  - Tailored layout visibility rules (external_stock, off_plan, overseas_sale, rent)
 *  - Contextual labels per layout
 *  - Picklist enum options with numeric Bitrix IDs
 */

const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.resolve(__dirname, '../config/fields.json');
const currentConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));

// 8 Sections synchronized with Listing Details SPA 1058
const synchronizedListingSections = [
  {
    id: 'general',
    title: 'Commercial Terms & General Overview',
    icon: '📋',
    desc: 'Listing title, type, agreement authority, stage and responsible broker',
    defaultOpen: true,
    fields: [
      {
        code: 'UF_CRM_1791952409183',
        leadAltCode: 'UF_CRM_LISTING_NAME',
        spaKey: 'title',
        spaCrmCode: 'TITLE',
        label: 'Listing Title',
        bitrixLabel: 'Listing Name',
        type: 'string',
        placeholder: 'e.g. Luxury 4BR Penthouse in Downtown Dubai...',
        fullWidth: true,
        rules: { external_stock: 'show', off_plan: 'show', overseas_sale: 'show', rent: 'show' }
      },
      {
        code: 'STATUS_ID',
        spaKey: 'stageId',
        spaCrmCode: 'STAGE_ID',
        label: 'Stage',
        bitrixLabel: 'Status / Stage',
        type: 'stage',
        rules: { external_stock: 'show', off_plan: 'show', overseas_sale: 'show', rent: 'show' }
      },
      {
        code: 'ASSIGNED_BY_ID',
        spaKey: 'assignedById',
        spaCrmCode: 'ASSIGNED_BY_ID',
        label: 'Responsible Person',
        bitrixLabel: 'Responsible Person',
        type: 'user',
        rules: { external_stock: 'show', off_plan: 'show', overseas_sale: 'show', rent: 'show' }
      },
      {
        code: 'UF_CRM_1791952650167',
        leadAltCode: 'UF_CRM_LISTING_TYPE',
        spaKey: 'ufCrm16_1790154808',
        spaCrmCode: 'UF_CRM_16_1790154808',
        label: 'Listing Type (Layout Driver)',
        bitrixLabel: 'Listing type',
        type: 'enumeration',
        placeholder: '-- Select Listing Type --',
        options: [
          { id: '2578', spaId: '158', value: 'RENT' },
          { id: '2580', spaId: '160', value: 'Overseas Sale' },
          { id: '2582', spaId: '162', value: 'Off-plan Listing' },
          { id: '2584', spaId: '164', value: 'External Stock' }
        ],
        rules: { external_stock: 'show', off_plan: 'show', overseas_sale: 'show', rent: 'show' }
      },
      {
        code: 'UF_CRM_1791970897872',
        leadAltCode: 'UF_CRM_EXCLUSIVE',
        spaKey: 'ufCrm16Exclusive',
        spaCrmCode: 'UF_CRM_16_EXCLUSIVE',
        label: 'Listing Agreement (Exclusive / Non-Exclusive)',
        bitrixLabel: 'Exclusive',
        type: 'boolean',
        rules: { external_stock: 'show', off_plan: 'show', overseas_sale: 'show', rent: 'show' }
      },
      {
        code: 'XML_ID',
        leadAltCode: 'UF_CRM_LISTING_ID',
        spaKey: 'xmlId',
        spaCrmCode: 'XML_ID',
        label: 'External ID (xmlId)',
        bitrixLabel: 'External ID',
        type: 'string',
        placeholder: 'e.g. EXT-984210',
        rules: { external_stock: 'show', off_plan: 'opt', overseas_sale: 'opt', rent: 'opt' }
      }
    ]
  },
  {
    id: 'seller',
    title: 'Seller & Source',
    icon: '🤝',
    desc: 'Agency, developer, owner contacts, and master property relation',
    fields: [
      {
        code: 'COMPANY_ID',
        spaKey: 'companyId',
        spaCrmCode: 'COMPANY_ID',
        label: 'Company (Agency or Developer)',
        bitrixLabel: 'Company',
        type: 'crm_company',
        rules: { external_stock: 'show', off_plan: 'show', overseas_sale: 'show', rent: 'show' }
      },
      {
        code: 'CONTACT_ID',
        spaKey: 'contactId',
        spaCrmCode: 'CONTACT_ID',
        label: 'Contact',
        bitrixLabel: 'Contact',
        type: 'crm_contact',
        rules: { external_stock: 'show', off_plan: 'show', overseas_sale: 'show', rent: 'show' }
      },
      {
        code: 'UF_CRM_CONTACTS',
        spaKey: 'contactIds',
        spaCrmCode: 'CONTACT_IDS',
        label: 'Contacts',
        bitrixLabel: 'Contacts',
        type: 'crm_contact_multi',
        rules: { external_stock: 'show', off_plan: 'show', overseas_sale: 'show', rent: 'show' }
      },
      {
        code: 'UF_CRM_PROPERTY',
        spaKey: 'parentId1052',
        spaCrmCode: 'PARENT_ID_1052',
        label: 'Master Property (parentId1052)',
        bitrixLabel: 'Property',
        type: 'crm_entity',
        placeholder: 'Property SPA reference...',
        rules: { external_stock: 'opt', off_plan: 'show', overseas_sale: 'opt', rent: 'opt' }
      },
      {
        code: 'UF_CRM_DEVELOPER_NAME',
        spaKey: 'ufCrm16DeveloperName',
        spaCrmCode: 'UF_CRM_16_DEVELOPER_NAME',
        label: 'Developer Name',
        bitrixLabel: 'Developer Name',
        type: 'string',
        placeholder: 'e.g. Emaar, Damac, Sobha...',
        rules: { external_stock: 'opt', off_plan: 'show', overseas_sale: 'opt', rent: 'opt' }
      },
      {
        code: 'UF_CRM_DEVELOPER_1',
        spaKey: 'ufCrm16_1791172932',
        spaCrmCode: 'UF_CRM_16_1791172932',
        label: 'Developer CRM Entity',
        bitrixLabel: 'Developer',
        type: 'crm_entity',
        rules: { external_stock: 'opt', off_plan: 'show', overseas_sale: 'opt', rent: 'opt' }
      }
    ]
  },
  {
    id: 'specs',
    title: 'Property Specifications',
    icon: '📐',
    desc: 'Dimensions, rooms, spaces, floor, and furnishing',
    fields: [
      {
        code: 'UF_CRM_1791952050535',
        spaKey: 'ufCrm16PropertyType',
        spaCrmCode: 'UF_CRM_16_PROPERTY_TYPE',
        label: 'Property Type',
        bitrixLabel: 'Property Type',
        type: 'enumeration',
        placeholder: '-- Select Property Type --',
        options: [
          { id: '1754', spaId: '886', value: 'Apartment' },
          { id: '1756', spaId: '888', value: 'Villa' },
          { id: '1758', spaId: '890', value: 'Townhouse' },
          { id: '1760', spaId: '892', value: 'Penthouse' },
          { id: '1762', spaId: '894', value: 'Duplex' },
          { id: '1764', spaId: '896', value: 'Land' },
          { id: '1766', spaId: '898', value: 'Commercial' },
          { id: '1768', spaId: '900', value: 'Office' },
          { id: '1770', spaId: '902', value: 'Retail' }
        ],
        rules: { external_stock: 'show', off_plan: 'show', overseas_sale: 'show', rent: 'show' }
      },
      {
        code: 'UF_CRM_PROPERTY_SUB_TYPE',
        spaKey: 'ufCrm16PropertySubType',
        spaCrmCode: 'UF_CRM_16_PROPERTY_SUB_TYPE',
        label: 'Property Sub-type',
        bitrixLabel: 'Property Sub Type',
        type: 'enumeration',
        placeholder: '-- Select Property Sub Type --',
        options: [
          { id: '2098', spaId: '872', value: 'Standard' },
          { id: '2100', spaId: '874', value: 'Luxury' },
          { id: '2102', spaId: '876', value: 'Ultra Luxury' },
          { id: '2104', spaId: '878', value: 'Simplex' },
          { id: '2106', spaId: '880', value: 'Duplex' },
          { id: '2108', spaId: '882', value: 'Triplex' },
          { id: '2110', spaId: '884', value: 'Penthouse' }
        ],
        rules: { external_stock: 'show', off_plan: 'show', overseas_sale: 'show', rent: 'show' }
      },
      {
        code: 'UF_CRM_BEDROOMS',
        leadAltCode: 'UF_CRM_1791966366775',
        spaKey: 'ufCrm16_1791172802',
        spaCrmCode: 'UF_CRM_16_1791172802',
        label: 'Bedrooms',
        bitrixLabel: 'Bedrooms',
        type: 'number',
        placeholder: 'e.g. 3',
        rules: { external_stock: 'show', off_plan: 'show', overseas_sale: 'show', rent: 'show' }
      },
      {
        code: 'UF_CRM_BATHROOMS',
        leadAltCode: 'UF_CRM_1791966408374',
        spaKey: 'ufCrm16_1791172787',
        spaCrmCode: 'UF_CRM_16_1791172787',
        label: 'Bathrooms',
        bitrixLabel: 'Bathrooms',
        type: 'number',
        placeholder: 'e.g. 4',
        rules: { external_stock: 'show', off_plan: 'show', overseas_sale: 'show', rent: 'show' }
      },
      {
        code: 'UF_CRM_BUA',
        spaKey: 'ufCrm16SqFt',
        spaCrmCode: 'UF_CRM_16_SQ_FT',
        label: 'Built-up Area (Sq Ft)',
        bitrixLabel: 'Built-up Area (Sq. Ft.)',
        type: 'number',
        addon: 'Sq Ft',
        placeholder: 'e.g. 2450',
        rules: { external_stock: 'show', off_plan: 'show', overseas_sale: 'show', rent: 'show' }
      },
      {
        code: 'UF_CRM_PLOT_AREA',
        spaKey: 'ufCrm16PlotSize',
        spaCrmCode: 'UF_CRM_16_PLOT_SIZE',
        label: 'Plot Area (Sq Ft)',
        bitrixLabel: 'Plot Area (Sq. Ft.)',
        type: 'number',
        addon: 'Sq Ft',
        placeholder: 'e.g. 4200',
        rules: { external_stock: 'opt', off_plan: 'opt', overseas_sale: 'opt', rent: 'opt' }
      },
      {
        code: 'UF_CRM_UNIT_NO',
        spaKey: 'ufCrm16UnitNumber',
        spaCrmCode: 'UF_CRM_16_UNIT_NUMBER',
        label: 'Unit Number',
        bitrixLabel: 'Unit Number',
        type: 'string',
        placeholder: 'e.g. 1402',
        rules: { external_stock: 'show', off_plan: 'show', overseas_sale: 'opt', rent: 'show' }
      },
      {
        code: 'UF_CRM_FLOOR',
        spaKey: 'ufCrm16Floor',
        spaCrmCode: 'UF_CRM_16_FLOOR',
        label: 'Floor Number',
        bitrixLabel: 'Floor',
        type: 'integer',
        placeholder: 'e.g. 14',
        rules: { external_stock: 'show', off_plan: 'show', overseas_sale: 'opt', rent: 'show' }
      },
      {
        code: 'UF_CRM_1791969936048',
        spaKey: 'ufCrm16Furnished',
        spaCrmCode: 'UF_CRM_16_FURNISHED',
        label: 'Furnished Status',
        bitrixLabel: 'Furnished',
        type: 'enumeration',
        placeholder: '-- Select Furnished Status --',
        options: [
          { id: '1794', spaId: '736', value: 'Furnished' },
          { id: '1796', spaId: '738', value: 'Semi-Furnished' },
          { id: '1798', spaId: '740', value: 'Unfurnished' }
        ],
        rules: { external_stock: 'opt', off_plan: 'hide', overseas_sale: 'opt', rent: 'show' }
      },
      {
        code: 'UF_CRM_NUMBEROFPARKINGSPACES',
        spaKey: 'ufCrm16ParkingSpaces',
        spaCrmCode: 'UF_CRM_16_PARKING_SPACES',
        label: 'Parking Spaces',
        bitrixLabel: 'Number of Parking Spaces',
        type: 'integer',
        placeholder: 'e.g. 2',
        rules: { external_stock: 'show', off_plan: 'opt', overseas_sale: 'opt', rent: 'show' }
      }
    ]
  },
  {
    id: 'location',
    title: 'Building, Location & Geography',
    icon: '📍',
    desc: 'Country, city, community, tower, and coordinates',
    fields: [
      {
        code: 'UF_CRM_PROJECT_NAME',
        leadAltCode: 'UF_CRM_PROJECT_1',
        spaKey: 'ufCrm16ProjectName',
        spaCrmCode: 'UF_CRM_16_PROJECT_NAME',
        label: 'Project / Building Name',
        bitrixLabel: 'Project Name',
        type: 'string',
        placeholder: 'e.g. Downtown Views II, Creek Horizon...',
        rules: { external_stock: 'show', off_plan: 'show', overseas_sale: 'opt', rent: 'show' }
      },
      {
        code: 'UF_CRM_BUILDING_DUBIZZLE',
        spaKey: 'ufCrm16BuildingBayut',
        spaCrmCode: 'UF_CRM_16_BUILDING_BAYUT',
        label: 'Building / Tower Name (Bayut)',
        bitrixLabel: 'Building - Bayut',
        type: 'string',
        placeholder: 'e.g. Tower A, East Wing...',
        rules: { external_stock: 'show', off_plan: 'show', overseas_sale: 'opt', rent: 'show' }
      },
      {
        code: 'UF_CRM_COMMUNITY_PROPERTYFINDER',
        spaKey: 'ufCrm16CommunityPropertyfinder',
        spaCrmCode: 'UF_CRM_16_COMMUNITY_PROPERTYFINDER',
        label: 'Community - Propertyfinder',
        bitrixLabel: 'Community - Propertyfinder',
        type: 'string',
        placeholder: 'e.g. Downtown Dubai, Palm Jumeirah...',
        rules: { external_stock: 'show', off_plan: 'show', overseas_sale: 'opt', rent: 'show' }
      },
      {
        code: 'UF_CRM_SUB_COMMUNITY_PROPERTYFINDER',
        spaKey: 'ufCrm16SubCommunityPropertyfinder',
        spaCrmCode: 'UF_CRM_16_SUB_COMMUNITY_PROPERTYFINDER',
        label: 'Sub-Community',
        bitrixLabel: 'Sub Community - Propertyfinder',
        type: 'string',
        placeholder: 'e.g. Burj Crown, Marina Gate 2...',
        rules: { external_stock: 'show', off_plan: 'show', overseas_sale: 'opt', rent: 'show' }
      },
      {
        code: 'UF_CRM_NEIGHBORHOOD',
        spaKey: 'ufCrm16_1791173032',
        spaCrmCode: 'UF_CRM_16_1791173032',
        label: 'Neighborhood / Community',
        bitrixLabel: 'Neighborhood',
        type: 'string',
        placeholder: 'e.g. Business Bay, Dubai Marina...',
        rules: { external_stock: 'show', off_plan: 'show', overseas_sale: 'show', rent: 'show' }
      },
      {
        code: 'UF_CRM_CITY',
        spaKey: 'ufCrm16_1791172815',
        spaCrmCode: 'UF_CRM_16_1791172815',
        label: 'City',
        bitrixLabel: 'City',
        type: 'string',
        placeholder: 'e.g. Dubai, London, Abu Dhabi...',
        rules: { external_stock: 'show', off_plan: 'show', overseas_sale: 'show', rent: 'show' }
      },
      {
        code: 'UF_CRM_COUNTRY',
        spaKey: 'ufCrm16_1791172854',
        spaCrmCode: 'UF_CRM_16_1791172854',
        label: 'Country',
        bitrixLabel: 'Country',
        type: 'string',
        placeholder: 'e.g. United Arab Emirates, UK, France...',
        rules: { external_stock: 'opt', off_plan: 'opt', overseas_sale: 'show', rent: 'opt' }
      },
      {
        code: 'UF_CRM_STREET',
        spaKey: 'ufCrm16Street',
        spaCrmCode: 'UF_CRM_16_STREET',
        label: 'Street',
        bitrixLabel: 'Street',
        type: 'string',
        placeholder: 'e.g. Sheikh Mohammed bin Rashid Blvd...',
        rules: { external_stock: 'show', off_plan: 'show', overseas_sale: 'show', rent: 'show' }
      },
      {
        code: 'UF_CRM_1791970638065',
        spaKey: 'ufCrm16_1791172676',
        spaCrmCode: 'UF_CRM_16_1791172676',
        label: 'Address',
        bitrixLabel: 'Property Address',
        type: 'address',
        placeholder: 'Street, building, unit number...',
        rules: { external_stock: 'show', off_plan: 'show', overseas_sale: 'show', rent: 'show' }
      },
      {
        code: 'UF_CRM_LATITUDE',
        spaKey: 'ufCrm16Latitude',
        spaCrmCode: 'UF_CRM_16_LATITUDE',
        label: 'Latitude',
        bitrixLabel: 'Latitude',
        type: 'number',
        placeholder: 'e.g. 25.1972',
        rules: { external_stock: 'show', off_plan: 'show', overseas_sale: 'show', rent: 'show' }
      },
      {
        code: 'UF_CRM_LONGITUDE',
        spaKey: 'ufCrm16Longitude',
        spaCrmCode: 'UF_CRM_16_LONGITUDE',
        label: 'Longitude',
        bitrixLabel: 'Longitude',
        type: 'number',
        placeholder: 'e.g. 55.2744',
        rules: { external_stock: 'show', off_plan: 'show', overseas_sale: 'show', rent: 'show' }
      }
    ]
  },
  {
    id: 'pricing',
    title: 'Pricing & Financial Terms',
    icon: '💰',
    desc: 'Asking price, rent frequency, commission, and payment plans',
    fields: [
      {
        code: 'UF_CRM_LISTING_PRICE',
        leadAltCode: 'UF_CRM_1791963299133',
        spaKey: 'ufCrm16_1790154936',
        spaCrmCode: 'UF_CRM_16_1790154936',
        label: 'Listing Price (AED)',
        bitrixLabel: 'Listing Price',
        type: 'money',
        addon: 'AED',
        placeholder: 'e.g. 2,500,000',
        rules: { external_stock: 'show', off_plan: 'show', overseas_sale: 'show', rent: 'show' },
        labelOverrides: {
          rent: 'Listing Price (as annual rent)'
        }
      },
      {
        code: 'UF_CRM_PRICE_PER_SQUARE_FOOT',
        spaKey: 'ufCrm16ListPricePerSqFt',
        spaCrmCode: 'UF_CRM_16_LIST_PRICE_PER_SQ_FT',
        label: 'Price Per Sq Ft',
        bitrixLabel: 'Price Per Square Foot',
        type: 'money',
        addon: 'AED/SqFt',
        placeholder: 'e.g. 1,450',
        rules: { external_stock: 'show', off_plan: 'show', overseas_sale: 'show', rent: 'opt' }
      },
      {
        code: 'UF_CRM_BUYERAGENTCOMMISSION',
        spaKey: 'ufCrm16BuyersAgentCommission',
        spaCrmCode: 'UF_CRM_16_BUYERS_AGENT_COMMISSION',
        label: 'Agency Commission (%)',
        bitrixLabel: 'Buyers Agent Commission %',
        type: 'number',
        addon: '%',
        placeholder: 'e.g. 2.0',
        rules: { external_stock: 'show', off_plan: 'show', overseas_sale: 'show', rent: 'show' }
      },
      {
        code: 'UF_CRM_SERVICE_CHARGE',
        spaKey: 'ufCrm16ServiceCharge',
        spaCrmCode: 'UF_CRM_16_SERVICE_CHARGE',
        label: 'Service Charges (Annual)',
        bitrixLabel: 'Service Charges',
        type: 'money',
        addon: 'AED',
        placeholder: 'e.g. 15,000',
        rules: { external_stock: 'opt', off_plan: 'opt', overseas_sale: 'opt', rent: 'opt' }
      },
      {
        code: 'UF_CRM_HOAFREQUENCY',
        spaKey: 'ufCrm16HoaFrequency',
        spaCrmCode: 'UF_CRM_16_HOA_FREQUENCY',
        label: 'Rental Frequency',
        bitrixLabel: 'HOA Frequency',
        type: 'enumeration',
        placeholder: '-- Select Rental Frequency --',
        options: [
          { id: '1998', spaId: '762', value: 'Monthly' },
          { id: '2000', spaId: '764', value: 'Quarterly' },
          { id: '2002', spaId: '766', value: 'Semi-Annually' },
          { id: '2004', spaId: '768', value: 'Annually' },
          { id: '2006', spaId: '770', value: 'Included in Rent' },
          { id: '2008', spaId: '772', value: 'None' }
        ],
        rules: { external_stock: 'hide', off_plan: 'hide', overseas_sale: 'hide', rent: 'show' }
      },
      {
        code: 'UF_CRM_PETDEPOSIT',
        spaKey: 'ufCrm16PetDeposit',
        spaCrmCode: 'UF_CRM_16_PET_DEPOSIT',
        label: 'Security Deposit (AED)',
        bitrixLabel: 'Pet Deposit',
        type: 'money',
        addon: 'AED',
        placeholder: 'e.g. 10,000',
        rules: { external_stock: 'hide', off_plan: 'hide', overseas_sale: 'hide', rent: 'show' }
      },
      {
        code: 'UF_CRM_1792139023',
        leadAltCode: 'UF_CRM_CHEQUES',
        spaKey: 'ufCrm16_1792127520',
        spaCrmCode: 'UF_CRM_16_1792127520',
        label: 'Number of Cheques',
        bitrixLabel: 'Cheques',
        type: 'enumeration',
        placeholder: '-- Select Cheques --',
        options: [
          { id: '2440', spaId: '2432', value: '1 Cheque' },
          { id: '2442', spaId: '2434', value: '2 Cheque' },
          { id: '2444', spaId: '2434', value: '2 Cheques' },
          { id: '2446', spaId: '2436', value: '4 Cheque' },
          { id: '2448', spaId: '2438', value: '6 Cheque' },
          { id: '2450', spaId: '2440', value: '12 Cheque' }
        ],
        rules: { external_stock: 'hide', off_plan: 'opt', overseas_sale: 'hide', rent: 'show' },
        labelOverrides: {
          off_plan: 'Number of Cheques (payment plan)'
        }
      }
    ]
  },
  {
    id: 'dates',
    title: 'Dates & Timeline',
    icon: '📅',
    desc: 'Mandate duration, availability, and tenancy start/finish dates',
    fields: [
      {
        code: 'UF_CRM_AVAIL_DATE',
        leadAltCode: 'BEGINDATE',
        spaKey: 'begindate',
        spaCrmCode: 'BEGINDATE',
        label: 'Started on',
        bitrixLabel: 'Available From Date',
        type: 'date',
        rules: { external_stock: 'show', off_plan: 'opt', overseas_sale: 'opt', rent: 'show' },
        labelOverrides: {
          external_stock: 'Started on (mandate period)',
          rent: 'Started on (tenancy / availability)'
        }
      },
      {
        code: 'UF_CRM_AVAILABLE_TO',
        leadAltCode: 'CLOSEDATE',
        spaKey: 'closedate',
        spaCrmCode: 'CLOSEDATE',
        label: 'Finished on',
        bitrixLabel: 'Available To Date',
        type: 'date',
        rules: { external_stock: 'show', off_plan: 'opt', overseas_sale: 'opt', rent: 'show' },
        labelOverrides: {
          external_stock: 'Finished on (mandate period)',
          rent: 'Finished on (tenancy / availability)'
        }
      },
      {
        code: 'UF_CRM_DATE_AVAILABLE',
        spaKey: 'ufCrm16_1790155057',
        spaCrmCode: 'UF_CRM_16_1790155057',
        label: 'Available From',
        bitrixLabel: 'Date Available',
        type: 'date',
        rules: { external_stock: 'show', off_plan: 'show', overseas_sale: 'show', rent: 'show' }
      },
      {
        code: 'UF_CRM_COMPLETIONDATE',
        spaKey: 'ufCrm16CompletionDate',
        spaCrmCode: 'UF_CRM_16_COMPLETION_DATE',
        label: 'Handover / Completion Date',
        bitrixLabel: 'Completion Date',
        type: 'date',
        rules: { external_stock: 'hide', off_plan: 'show', overseas_sale: 'opt', rent: 'hide' }
      },
      {
        code: 'UF_CRM_COMPLETION_STATUS',
        spaKey: 'ufCrm16CompletionStatus',
        spaCrmCode: 'UF_CRM_16_COMPLETION_STATUS',
        label: 'Completion Status',
        bitrixLabel: 'Completion Status',
        type: 'enumeration',
        placeholder: '-- Select Completion Status --',
        options: [
          { id: '1944', spaId: '702', value: 'Off-Plan' },
          { id: '1946', spaId: '704', value: 'Under Construction' },
          { id: '1948', spaId: '706', value: 'Completed' },
          { id: '1950', spaId: '708', value: 'Handover' },
          { id: '1952', spaId: '710', value: 'Ready' }
        ],
        rules: { external_stock: 'hide', off_plan: 'show', overseas_sale: 'opt', rent: 'hide' }
      },
      {
        code: 'UF_CRM_1791970832589',
        spaKey: 'ufCrm16Occupancy',
        spaCrmCode: 'UF_CRM_16_OCCUPANCY',
        label: 'Tenancy Status',
        bitrixLabel: 'Occupancy Status',
        type: 'enumeration',
        placeholder: '-- Select Tenancy Status --',
        options: [
          { id: '1824', spaId: '836', value: 'Vacant on Transfer' },
          { id: '1826', spaId: '838', value: 'Owner Occupied' },
          { id: '1828', spaId: '840', value: 'Rented' },
          { id: '1830', spaId: '842', value: 'Under Notice' },
          { id: '1832', spaId: '844', value: 'Vacant' }
        ],
        rules: { external_stock: 'opt', off_plan: 'hide', overseas_sale: 'opt', rent: 'show' }
      },
      {
        code: 'UF_CRM_EXPIRATION_DATE',
        spaKey: 'ufCrm16ExpirationDate',
        spaCrmCode: 'UF_CRM_16_EXPIRATION_DATE',
        label: 'Tenancy End / Mandate Expiry Date',
        bitrixLabel: 'Expiration Date',
        type: 'date',
        rules: { external_stock: 'opt', off_plan: 'hide', overseas_sale: 'opt', rent: 'show' }
      }
    ]
  },
  {
    id: 'marketing',
    title: 'Portals & Marketing',
    icon: '🚀',
    desc: 'Bayut, Propertyfinder, Dubizzle IDs, feed toggles, RERA permit, and descriptions',
    fields: [
      {
        code: 'UF_CRM_1791970864836',
        leadAltCode: 'UF_CRM_RERA_PERMIT',
        spaKey: 'ufCrm16ReraPermitNumber',
        spaCrmCode: 'UF_CRM_16_RERA_PERMIT_NUMBER',
        label: 'RERA Permit Number',
        bitrixLabel: 'RERA Permit Number',
        type: 'string',
        placeholder: 'e.g. 7114829100',
        rules: { external_stock: 'opt', off_plan: 'show', overseas_sale: 'hide', rent: 'show' }
      },
      {
        code: 'UF_CRM_TRAKHEESI_PERMIT_NO',
        spaKey: 'ufCrm16_1791787455285',
        spaCrmCode: 'UF_CRM_16_1791787455285',
        label: 'Trakheesi Permit No',
        bitrixLabel: 'Trakheesi Permit No',
        type: 'string',
        placeholder: 'e.g. TRK-982145',
        rules: { external_stock: 'opt', off_plan: 'show', overseas_sale: 'hide', rent: 'show' }
      },
      {
        code: 'UF_CRM_TRAKHEESI_EXPIRY',
        leadAltCode: 'UF_CRM_TRAKHEESI_PERMIT_EXPIRY_DATE',
        spaKey: 'ufCrm16_1791787502111',
        spaCrmCode: 'UF_CRM_16_1791787502111',
        label: 'Trakheesi Permit Expiry Date',
        bitrixLabel: 'Trakheesi Permit Expiry',
        type: 'date',
        rules: { external_stock: 'opt', off_plan: 'show', overseas_sale: 'hide', rent: 'show' }
      },
      {
        code: 'UF_CRM_TRAKHEESI_PERMIT_EXPIRY_DATE',
        spaKey: 'ufCrm16_1791787502111',
        spaCrmCode: 'UF_CRM_16_1791787502111',
        label: 'Trakheesi Permit Expiry Date (Alternative)',
        bitrixLabel: 'Trakheesi Permit Expiry Date',
        type: 'date',
        rules: { external_stock: 'opt', off_plan: 'show', overseas_sale: 'hide', rent: 'show' }
      },
      {
        code: 'UF_CRM_QR_CODE_LINK',
        spaKey: 'ufCrm16QrCodeLink',
        spaCrmCode: 'UF_CRM_16_QR_CODE_LINK',
        label: 'DLD QR / Permit URL',
        bitrixLabel: 'QR Code Link',
        type: 'url',
        placeholder: 'https://dubailand.gov.ae/en/eservices/licensing/...',
        rules: { external_stock: 'opt', off_plan: 'show', overseas_sale: 'hide', rent: 'show' }
      },
      {
        code: 'UF_CRM_QR_CODE',
        spaKey: 'ufCrm16QrCodeFile',
        spaCrmCode: 'UF_CRM_16_QR_CODE_FILE',
        label: 'DLD QR Code Attachment',
        bitrixLabel: 'QR Code File',
        type: 'file',
        rules: { external_stock: 'opt', off_plan: 'opt', overseas_sale: 'hide', rent: 'opt' }
      },
      {
        code: 'UF_CRM_BAYUT_ID',
        spaKey: 'ufCrm16_1790155092',
        spaCrmCode: 'UF_CRM_16_1790155092',
        label: 'Bayut Listing ID',
        bitrixLabel: 'Bayut ID',
        type: 'string',
        placeholder: 'e.g. BYT-481902',
        rules: { external_stock: 'opt', off_plan: 'show', overseas_sale: 'hide', rent: 'show' }
      },
      {
        code: 'UF_CRM_1792151466',
        leadAltCode: 'UF_CRM_PF_ID',
        spaKey: 'ufCrm16PropertyFinderListingId',
        spaCrmCode: 'UF_CRM_16_PROPERTY_FINDER_LISTING_ID',
        label: 'Property Finder Listing Id',
        bitrixLabel: 'Property Finder Listing Id',
        type: 'string',
        placeholder: 'e.g. PF-981273',
        rules: { external_stock: 'opt', off_plan: 'show', overseas_sale: 'hide', rent: 'show' }
      },
      {
        code: 'UF_CRM_PF_ID',
        spaKey: 'ufCrm16PropertyFinderListingId',
        spaCrmCode: 'UF_CRM_16_PROPERTY_FINDER_LISTING_ID',
        label: 'Propertyfinder Listing ID',
        bitrixLabel: 'PF ID',
        type: 'string',
        placeholder: 'e.g. PF-981273',
        rules: { external_stock: 'opt', off_plan: 'show', overseas_sale: 'hide', rent: 'show' }
      },
      {
        code: 'UF_CRM_PORTAL_LISTING_ID',
        spaKey: 'ufCrm16PortalListingId',
        spaCrmCode: 'UF_CRM_16_PORTAL_LISTING_ID',
        label: 'Portal Listing ID',
        bitrixLabel: 'Portal Listing Id',
        type: 'string',
        placeholder: 'e.g. PORT-1122',
        rules: { external_stock: 'opt', off_plan: 'opt', overseas_sale: 'hide', rent: 'opt' }
      },
      {
        code: 'UF_CRM_DUBIZZLE_REGION',
        spaKey: 'ufCrm16DubizzleRegion',
        spaCrmCode: 'UF_CRM_16_DUBIZZLE_REGION',
        label: 'Dubizzle Listing ID / Region',
        bitrixLabel: 'Dubizzle Region',
        type: 'string',
        placeholder: 'e.g. DBZ-558291',
        rules: { external_stock: 'opt', off_plan: 'show', overseas_sale: 'hide', rent: 'show' }
      },
      {
        code: 'UF_CRM_SYSTEMALLOWEDFORPORTALS',
        leadAltCode: 'UF_CRM_PORTALS_ENABLED',
        spaKey: 'ufCrm16SystemAllowedForPortals',
        spaCrmCode: 'UF_CRM_16_SYSTEM_ALLOWED_FOR_PORTALS',
        label: 'Bayut / Dubizzle Feed Toggle',
        bitrixLabel: 'System Allowed for Portals',
        type: 'boolean',
        rules: { external_stock: 'opt', off_plan: 'show', overseas_sale: 'hide', rent: 'show' }
      },
      {
        code: 'UF_CRM_UK_SUMMARY_DESCRIPTION',
        spaKey: 'ufCrm16SummaryDescription',
        spaCrmCode: 'UF_CRM_16_SUMMARY_DESCRIPTION',
        label: 'Portal Title',
        bitrixLabel: 'Summary Description',
        type: 'string',
        placeholder: 'SEO Headline for Portals...',
        fullWidth: true,
        rules: { external_stock: 'opt', off_plan: 'show', overseas_sale: 'opt', rent: 'show' }
      },
      {
        code: 'UF_CRM_DESCRIPTION',
        spaKey: 'ufCrm16Description',
        spaCrmCode: 'UF_CRM_16_DESCRIPTION',
        label: 'Portal Description',
        bitrixLabel: 'Property Description / Amenities',
        type: 'textarea',
        placeholder: 'Marketing description, key amenities...',
        fullWidth: true,
        rules: { external_stock: 'opt', off_plan: 'show', overseas_sale: 'opt', rent: 'show' }
      }
    ]
  },
  {
    id: 'media',
    title: 'Media & Documents',
    icon: '📸',
    desc: 'Primary images, title deeds, brochures, floor plans, and 360 virtual tours',
    fields: [
      {
        code: 'UF_CRM_PRIMARY_IMAGE',
        spaKey: 'ufCrm16_1791173118',
        spaCrmCode: 'UF_CRM_16_1791173118',
        label: 'Primary Listing Image',
        bitrixLabel: 'Primary Listing Image',
        type: 'file',
        isImage: true,
        rules: { external_stock: 'show', off_plan: 'show', overseas_sale: 'show', rent: 'show' }
      },
      {
        code: 'UF_CRM_PHOTOS',
        spaKey: 'ufCrm16_1791881642219',
        spaCrmCode: 'UF_CRM_16_1791881642219',
        label: 'Photos (Gallery)',
        bitrixLabel: 'Photos',
        type: 'file',
        isImage: true,
        isMultiple: true,
        rules: { external_stock: 'show', off_plan: 'show', overseas_sale: 'show', rent: 'show' }
      },
      {
        code: 'UF_CRM_DOCS',
        spaKey: 'ufCrm16_1791172957',
        spaCrmCode: 'UF_CRM_16_1791172957',
        label: 'Docs & Attachments',
        bitrixLabel: 'Property Title / Deed Docs',
        type: 'file',
        isDoc: true,
        rules: { external_stock: 'show', off_plan: 'show', overseas_sale: 'show', rent: 'show' }
      },
      {
        code: 'UF_CRM_PHOTOS_AND_DOCUMENTS',
        leadAltCode: 'UF_CRM_FLOOR_PLAN',
        spaKey: 'ufCrm16_1791544736052',
        spaCrmCode: 'UF_CRM_16_1791544736052',
        label: 'Floor Plan',
        bitrixLabel: 'Photos and Documents',
        type: 'file',
        rules: { external_stock: 'opt', off_plan: 'show', overseas_sale: 'opt', rent: 'opt' }
      },
      {
        code: 'UF_CRM_TITLE_DEED',
        spaKey: 'ufCrm16TitleDeed',
        spaCrmCode: 'UF_CRM_16_TITLE_DEED',
        label: 'Title Deed / Ownership Proof',
        bitrixLabel: 'Title Deed',
        type: 'file',
        isDoc: true,
        rules: { external_stock: 'show', off_plan: 'opt', overseas_sale: 'show', rent: 'opt' }
      },
      {
        code: 'UF_CRM_FORM_A_DOC',
        spaKey: 'ufCrm16_1791787381785',
        spaCrmCode: 'UF_CRM_16_1791787381785',
        label: 'Form A Document (Mandate Agreement)',
        bitrixLabel: 'Form A Signed Document',
        type: 'file',
        isDoc: true,
        rules: { external_stock: 'show', off_plan: 'opt', overseas_sale: 'opt', rent: 'show' }
      },
      {
        code: 'UF_CRM_WEBSITE_URL',
        spaKey: 'ufCrm16WebsiteUrl',
        spaCrmCode: 'UF_CRM_16_WEBSITE_URL',
        label: 'Brochure URL / File',
        bitrixLabel: 'Website URL',
        type: 'url',
        placeholder: 'https://cdn.example.com/brochures/listing.pdf',
        rules: { external_stock: 'opt', off_plan: 'show', overseas_sale: 'show', rent: 'hide' }
      },
      {
        code: 'UF_CRM_LISTING_WEBSITE',
        spaKey: 'ufCrm16ListingWebsite',
        spaCrmCode: 'UF_CRM_16_LISTING_WEBSITE',
        label: '360 Virtual Tour Link',
        bitrixLabel: 'Listing Website',
        type: 'tour_url',
        placeholder: 'https://my.matterport.com/show/?m=... or Kuula / YouTube 360',
        rules: { external_stock: 'opt', off_plan: 'opt', overseas_sale: 'opt', rent: 'opt' }
      }
    ]
  }
];

// Update listingDynamicLayout sections with bidirectional leadCode references
const updatedDynamicSections = (currentConfig.listingDynamicLayout?.sections || []).map(dynSec => {
  const matchSyncSec = synchronizedListingSections.find(s => s.id === dynSec.id);
  if (!matchSyncSec) return dynSec;

  const updatedFields = (dynSec.fields || [])
    .filter(dynField => dynField.key !== 'ufCrm16RecordType' && dynField.crmCode !== 'UF_CRM_16_RECORD_TYPE')
    .map(dynField => {
    const syncField = matchSyncSec.fields.find(f => f.spaKey === dynField.key || f.spaCrmCode === dynField.crmCode);
    if (syncField) {
      return {
        ...dynField,
        leadCode: syncField.code,
        leadAltCode: syncField.leadAltCode || undefined
      };
    }
    return dynField;
  });

  return {
    ...dynSec,
    fields: updatedFields
  };
});

// Flat list of all listing fields for validation & lookup
const allListingFieldsFlat = synchronizedListingSections.flatMap(s => s.fields);

const newConfig = {
  ...currentConfig,
  listingLayout: {
    title: 'Listing Form Layout (Dynamic Multi-Layout Synchronized)',
    layoutField: 'UF_CRM_1791952650167',
    layoutFieldAlt: 'UF_CRM_LISTING_TYPE',
    layoutEnumMap: {
      '2578': 'rent',
      'rent': 'rent',
      '2580': 'overseas_sale',
      'overseas sale': 'overseas_sale',
      '2582': 'off_plan',
      'off-plan': 'off_plan',
      'off-plan listing': 'off_plan',
      '2584': 'external_stock',
      'external stock': 'external_stock'
    },
    layoutMeta: currentConfig.listingDynamicLayout?.layoutMeta || {
      external_stock: { id: 'external_stock', title: 'External Stock', icon: '🏢', pillClass: 'layout-pill-external_stock' },
      off_plan: { id: 'off_plan', title: 'Off-plan', icon: '🏗️', pillClass: 'layout-pill-off_plan' },
      overseas_sale: { id: 'overseas_sale', title: 'Overseas Sale', icon: '🌍', pillClass: 'layout-pill-overseas_sale' },
      rent: { id: 'rent', title: 'Rent', icon: '🔑', pillClass: 'layout-pill-rent' }
    },
    sections: synchronizedListingSections
  },
  listingDynamicLayout: {
    ...currentConfig.listingDynamicLayout,
    sections: updatedDynamicSections
  },
  listingFields: allListingFieldsFlat
};

fs.writeFileSync(CONFIG_PATH, JSON.stringify(newConfig, null, 2), 'utf8');
console.log('✓ config/fields.json successfully synchronized!');
console.log(`  Sections: ${synchronizedListingSections.length}`);
console.log(`  Total Fields: ${allListingFieldsFlat.length}`);
