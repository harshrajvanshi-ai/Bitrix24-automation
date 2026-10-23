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
  'use strict';

  // ============================================================================
  // 1. CONFIGURATION & LAYOUT SPECIFICATIONS
  // ============================================================================
  const CONFIG = {
    entityTypeId: 1058,
    placement: 'CRM_DYNAMIC_1058_DETAIL_TAB',
    layoutField: 'ufCrm16_1790154808',
    layoutFieldCrm: 'UF_CRM_16_1790154808',

    // Mapping enum IDs & string labels to layout keys
    layoutEnumMap: {
      '164': 'external_stock',
      'external stock': 'external_stock',
      '162': 'off_plan',
      'off-plan': 'off_plan',
      'off-plan listing': 'off_plan',
      '160': 'overseas_sale',
      'overseas sale': 'overseas_sale',
      '158': 'rent',
      'rent': 'rent'
    },

    layoutMeta: {
      external_stock: {
        id: 'external_stock',
        enumId: '164',
        title: 'External Stock',
        icon: '🏢',
        pillClass: 'layout-pill-external_stock'
      },
      off_plan: {
        id: 'off_plan',
        enumId: '162',
        title: 'Off-plan',
        icon: '🏗️',
        pillClass: 'layout-pill-off_plan'
      },
      overseas_sale: {
        id: 'overseas_sale',
        enumId: '160',
        title: 'Overseas Sale',
        icon: '🌍',
        pillClass: 'layout-pill-overseas_sale'
      },
      rent: {
        id: 'rent',
        enumId: '158',
        title: 'Rent',
        icon: '🔑',
        pillClass: 'layout-pill-rent'
      }
    },

    // 8 Structured Sections according to User Specification synchronized with Listing SPA (1058 / CRM_16)
    sections: [
      {
        id: 'general',
        title: 'General Overview',
        icon: '📋',
        desc: 'Title, stage, responsible person, and listing authority',
        fields: [
          {
            key: 'title',
            crmCode: 'TITLE',
            label: 'Listing Title',
            type: 'string',
            placeholder: 'e.g. Luxury 4BR Penthouse in Downtown Dubai...',
            fullWidth: true,
            rules: { external_stock: 'show', off_plan: 'show', overseas_sale: 'show', rent: 'show' }
          },
          {
            key: 'stageId',
            crmCode: 'STAGE_ID',
            label: 'Stage',
            type: 'stage',
            rules: { external_stock: 'show', off_plan: 'show', overseas_sale: 'show', rent: 'show' }
          },
          {
            key: 'assignedById',
            crmCode: 'ASSIGNED_BY_ID',
            label: 'Responsible Person',
            type: 'user',
            rules: { external_stock: 'show', off_plan: 'show', overseas_sale: 'show', rent: 'show' }
          },
          {
            key: 'ufCrm16_1790154808',
            crmCode: 'UF_CRM_16_1790154808',
            label: 'Listing Type (Layout Driver)',
            type: 'enumeration',
            options: [
              { id: '164', value: 'External Stock' },
              { id: '162', value: 'Off-plan Listing' },
              { id: '160', value: 'Overseas Sale' },
              { id: '158', value: 'RENT' }
            ],
            rules: { external_stock: 'show', off_plan: 'show', overseas_sale: 'show', rent: 'show' }
          },
          {
            key: 'ufCrm16Exclusive',
            crmCode: 'UF_CRM_16_EXCLUSIVE',
            label: 'Listing Agreement (Exclusive / Non-Exclusive)',
            type: 'boolean',
            rules: { external_stock: 'show', off_plan: 'show', overseas_sale: 'show', rent: 'show' }
          },
          {
            key: 'xmlId',
            crmCode: 'XML_ID',
            label: 'External ID (xmlId)',
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
            key: 'companyId',
            crmCode: 'COMPANY_ID',
            label: 'Company (Agency or Developer)',
            type: 'crm_company',
            rules: { external_stock: 'show', off_plan: 'show', overseas_sale: 'show', rent: 'show' }
          },
          {
            key: 'contactId',
            crmCode: 'CONTACT_ID',
            label: 'Contact',
            type: 'crm_contact',
            rules: { external_stock: 'show', off_plan: 'show', overseas_sale: 'show', rent: 'show' }
          },
          {
            key: 'contactIds',
            crmCode: 'CONTACT_IDS',
            label: 'Contacts',
            type: 'crm_contact_multi',
            rules: { external_stock: 'show', off_plan: 'show', overseas_sale: 'show', rent: 'show' }
          },
          {
            key: 'parentId1052',
            crmCode: 'PARENT_ID_1052',
            label: 'Master Property (parentId1052)',
            type: 'crm_entity',
            placeholder: 'Property SPA reference...',
            rules: { external_stock: 'opt', off_plan: 'show', overseas_sale: 'opt', rent: 'opt' }
          },
          {
            key: 'ufCrm16DeveloperName',
            crmCode: 'UF_CRM_16_DEVELOPER_NAME',
            label: 'Developer Name',
            type: 'string',
            placeholder: 'e.g. Emaar, Damac, Sobha...',
            rules: { external_stock: 'opt', off_plan: 'show', overseas_sale: 'opt', rent: 'opt' }
          },
          {
            key: 'ufCrm16_1791172932',
            crmCode: 'UF_CRM_16_1791172932',
            label: 'Developer CRM Entity',
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
            key: 'ufCrm16PropertyType',
            crmCode: 'UF_CRM_16_PROPERTY_TYPE',
            label: 'Property Type',
            type: 'enumeration',
            options: [
              { id: '886', value: 'Apartment' },
              { id: '888', value: 'Villa' },
              { id: '890', value: 'Townhouse' },
              { id: '892', value: 'Penthouse' },
              { id: '894', value: 'Duplex' },
              { id: '896', value: 'Land' },
              { id: '898', value: 'Commercial' },
              { id: '900', value: 'Office' },
              { id: '902', value: 'Retail' }
            ],
            rules: { external_stock: 'show', off_plan: 'show', overseas_sale: 'show', rent: 'show' }
          },
          {
            key: 'ufCrm16PropertySubType',
            crmCode: 'UF_CRM_16_PROPERTY_SUB_TYPE',
            label: 'Property Sub-type',
            type: 'enumeration',
            options: [
              { id: '872', value: 'Standard' },
              { id: '874', value: 'Luxury' },
              { id: '876', value: 'Ultra Luxury' },
              { id: '878', value: 'Simplex' },
              { id: '880', value: 'Duplex' },
              { id: '882', value: 'Triplex' },
              { id: '884', value: 'Penthouse' }
            ],
            rules: { external_stock: 'show', off_plan: 'show', overseas_sale: 'show', rent: 'show' }
          },
          {
            key: 'ufCrm16_1791172802',
            crmCode: 'UF_CRM_16_1791172802',
            label: 'Bedrooms',
            type: 'number',
            placeholder: 'e.g. 3',
            rules: { external_stock: 'show', off_plan: 'show', overseas_sale: 'show', rent: 'show' }
          },
          {
            key: 'ufCrm16_1791172787',
            crmCode: 'UF_CRM_16_1791172787',
            label: 'Bathrooms',
            type: 'number',
            placeholder: 'e.g. 4',
            rules: { external_stock: 'show', off_plan: 'show', overseas_sale: 'show', rent: 'show' }
          },
          {
            key: 'ufCrm16SqFt',
            crmCode: 'UF_CRM_16_SQ_FT',
            label: 'Built-up Area (Sq Ft)',
            type: 'number',
            addon: 'Sq Ft',
            placeholder: 'e.g. 2450',
            rules: { external_stock: 'show', off_plan: 'show', overseas_sale: 'show', rent: 'show' }
          },
          {
            key: 'ufCrm16PlotSize',
            crmCode: 'UF_CRM_16_PLOT_SIZE',
            label: 'Plot Area (Sq Ft)',
            type: 'number',
            addon: 'Sq Ft',
            placeholder: 'e.g. 4200',
            rules: { external_stock: 'opt', off_plan: 'opt', overseas_sale: 'opt', rent: 'opt' }
          },
          {
            key: 'ufCrm16UnitNumber',
            crmCode: 'UF_CRM_16_UNIT_NUMBER',
            label: 'Unit Number',
            type: 'string',
            placeholder: 'e.g. 1402',
            rules: { external_stock: 'show', off_plan: 'show', overseas_sale: 'opt', rent: 'show' }
          },
          {
            key: 'ufCrm16Floor',
            crmCode: 'UF_CRM_16_FLOOR',
            label: 'Floor Number',
            type: 'integer',
            placeholder: 'e.g. 14',
            rules: { external_stock: 'show', off_plan: 'show', overseas_sale: 'opt', rent: 'show' }
          },
          {
            key: 'ufCrm16Furnished',
            crmCode: 'UF_CRM_16_FURNISHED',
            label: 'Furnished Status',
            type: 'enumeration',
            options: [
              { id: '736', value: 'Furnished' },
              { id: '738', value: 'Semi-Furnished' },
              { id: '740', value: 'Unfurnished' }
            ],
            rules: { external_stock: 'opt', off_plan: 'hide', overseas_sale: 'opt', rent: 'show' }
          },
          {
            key: 'ufCrm16RecordType',
            crmCode: 'UF_CRM_16_RECORD_TYPE',
            label: 'Offering / Record Type',
            type: 'enumeration',
            options: [
              { id: '1070', value: 'Residential' },
              { id: '1072', value: 'Commercial' },
              { id: '1074', value: 'Off-Plan' },
              { id: '1076', value: 'Secondary / Resale' },
              { id: '1078', value: 'Rental' },
              { id: '1080', value: 'Land / Plot' }
            ],
            rules: { external_stock: 'show', off_plan: 'show', overseas_sale: 'show', rent: 'show' }
          },
          {
            key: 'ufCrm16ParkingSpaces',
            crmCode: 'UF_CRM_16_PARKING_SPACES',
            label: 'Parking Spaces',
            type: 'integer',
            placeholder: 'e.g. 2',
            rules: { external_stock: 'show', off_plan: 'opt', overseas_sale: 'opt', rent: 'show' }
          }
        ]
      },
      {
        id: 'location',
        title: 'Location & Geography',
        icon: '📍',
        desc: 'Country, city, community, tower, and coordinates',
        fields: [
          {
            key: 'ufCrm16ProjectName',
            crmCode: 'UF_CRM_16_PROJECT_NAME',
            label: 'Project / Building Name',
            type: 'string',
            placeholder: 'e.g. Downtown Views II, Creek Horizon...',
            rules: { external_stock: 'show', off_plan: 'show', overseas_sale: 'opt', rent: 'show' }
          },
          {
            key: 'ufCrm16BuildingBayut',
            crmCode: 'UF_CRM_16_BUILDING_BAYUT',
            label: 'Building / Tower Name (Bayut)',
            type: 'string',
            placeholder: 'e.g. Tower A, East Wing...',
            rules: { external_stock: 'show', off_plan: 'show', overseas_sale: 'opt', rent: 'show' }
          },
          {
            key: 'ufCrm16CommunityPropertyfinder',
            crmCode: 'UF_CRM_16_COMMUNITY_PROPERTYFINDER',
            label: 'Community - Propertyfinder',
            type: 'string',
            placeholder: 'e.g. Downtown Dubai, Palm Jumeirah...',
            rules: { external_stock: 'show', off_plan: 'show', overseas_sale: 'opt', rent: 'show' }
          },
          {
            key: 'ufCrm16SubCommunityPropertyfinder',
            crmCode: 'UF_CRM_16_SUB_COMMUNITY_PROPERTYFINDER',
            label: 'Sub-Community',
            type: 'string',
            placeholder: 'e.g. Burj Crown, Marina Gate 2...',
            rules: { external_stock: 'show', off_plan: 'show', overseas_sale: 'opt', rent: 'show' }
          },
          {
            key: 'ufCrm16_1791173032',
            crmCode: 'UF_CRM_16_1791173032',
            label: 'Neighborhood / Community',
            type: 'string',
            placeholder: 'e.g. Business Bay, Dubai Marina...',
            rules: { external_stock: 'show', off_plan: 'show', overseas_sale: 'show', rent: 'show' }
          },
          {
            key: 'ufCrm16_1791172815',
            crmCode: 'UF_CRM_16_1791172815',
            label: 'City',
            type: 'string',
            placeholder: 'e.g. Dubai, London, Abu Dhabi...',
            rules: { external_stock: 'show', off_plan: 'show', overseas_sale: 'show', rent: 'show' }
          },
          {
            key: 'ufCrm16_1791172854',
            crmCode: 'UF_CRM_16_1791172854',
            label: 'Country',
            type: 'string',
            placeholder: 'e.g. United Arab Emirates, UK, France...',
            rules: { external_stock: 'opt', off_plan: 'opt', overseas_sale: 'show', rent: 'opt' }
          },
          {
            key: 'ufCrm16Street',
            crmCode: 'UF_CRM_16_STREET',
            label: 'Street',
            type: 'string',
            placeholder: 'e.g. Sheikh Mohammed bin Rashid Blvd...',
            rules: { external_stock: 'show', off_plan: 'show', overseas_sale: 'show', rent: 'show' }
          },
          {
            key: 'ufCrm16_1791172676',
            crmCode: 'UF_CRM_16_1791172676',
            label: 'Address',
            type: 'address',
            placeholder: 'Street, building, unit number...',
            rules: { external_stock: 'show', off_plan: 'show', overseas_sale: 'show', rent: 'show' }
          },
          {
            key: 'ufCrm16Latitude',
            crmCode: 'UF_CRM_16_LATITUDE',
            label: 'Latitude',
            type: 'number',
            placeholder: 'e.g. 25.1972',
            rules: { external_stock: 'show', off_plan: 'show', overseas_sale: 'show', rent: 'show' }
          },
          {
            key: 'ufCrm16Longitude',
            crmCode: 'UF_CRM_16_LONGITUDE',
            label: 'Longitude',
            type: 'number',
            placeholder: 'e.g. 55.2744',
            rules: { external_stock: 'show', off_plan: 'show', overseas_sale: 'show', rent: 'show' }
          }
        ]
      },
      {
        id: 'pricing',
        title: 'Pricing & Terms',
        icon: '💰',
        desc: 'Asking price, rent frequency, commission, and payment plans',
        fields: [
          {
            key: 'ufCrm16_1790154936',
            crmCode: 'UF_CRM_16_1790154936',
            label: 'Listing Price (AED)',
            type: 'money',
            addon: 'AED',
            placeholder: 'e.g. 2,500,000',
            rules: { external_stock: 'show', off_plan: 'show', overseas_sale: 'show', rent: 'show' },
            labelOverrides: {
              rent: 'Listing Price (as annual rent)'
            }
          },
          {
            key: 'ufCrm16ListPricePerSqFt',
            crmCode: 'UF_CRM_16_LIST_PRICE_PER_SQ_FT',
            label: 'Price Per Sq Ft',
            type: 'money',
            addon: 'AED/SqFt',
            placeholder: 'e.g. 1,450',
            rules: { external_stock: 'show', off_plan: 'show', overseas_sale: 'show', rent: 'opt' }
          },
          {
            key: 'ufCrm16BuyersAgentCommission',
            crmCode: 'UF_CRM_16_BUYERS_AGENT_COMMISSION',
            label: 'Agency Commission (%)',
            type: 'number',
            addon: '%',
            placeholder: 'e.g. 2.0',
            rules: { external_stock: 'show', off_plan: 'show', overseas_sale: 'show', rent: 'show' }
          },
          {
            key: 'ufCrm16ServiceCharge',
            crmCode: 'UF_CRM_16_SERVICE_CHARGE',
            label: 'Service Charges (Annual)',
            type: 'money',
            addon: 'AED',
            placeholder: 'e.g. 15,000',
            rules: { external_stock: 'opt', off_plan: 'opt', overseas_sale: 'opt', rent: 'opt' }
          },
          {
            key: 'ufCrm16HoaFrequency',
            crmCode: 'UF_CRM_16_HOA_FREQUENCY',
            label: 'Rental Frequency',
            type: 'enumeration',
            options: [
              { id: '762', value: 'Monthly' },
              { id: '764', value: 'Quarterly' },
              { id: '766', value: 'Semi-Annually' },
              { id: '768', value: 'Annually' },
              { id: '770', value: 'Included in Rent' },
              { id: '772', value: 'None' }
            ],
            rules: { external_stock: 'hide', off_plan: 'hide', overseas_sale: 'hide', rent: 'show' }
          },
          {
            key: 'ufCrm16PetDeposit',
            crmCode: 'UF_CRM_16_PET_DEPOSIT',
            label: 'Security Deposit (AED)',
            type: 'money',
            addon: 'AED',
            placeholder: 'e.g. 10,000',
            rules: { external_stock: 'hide', off_plan: 'hide', overseas_sale: 'hide', rent: 'show' }
          },
          {
            key: 'ufCrm16_1792127520',
            crmCode: 'UF_CRM_16_1792127520',
            label: 'Number of Cheques',
            type: 'enumeration',
            options: [
              { id: '2432', value: '1 Cheque' },
              { id: '2434', value: '2 Cheque' },
              { id: '2436', value: '4 Cheque' },
              { id: '2438', value: '6 Cheque' },
              { id: '2440', value: '12 Cheque' }
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
            key: 'begindate',
            crmCode: 'BEGINDATE',
            label: 'Started on',
            type: 'date',
            rules: { external_stock: 'show', off_plan: 'opt', overseas_sale: 'opt', rent: 'show' },
            labelOverrides: {
              external_stock: 'Started on (mandate period)',
              rent: 'Started on (tenancy / availability)'
            }
          },
          {
            key: 'closedate',
            crmCode: 'CLOSEDATE',
            label: 'Finished on',
            type: 'date',
            rules: { external_stock: 'show', off_plan: 'opt', overseas_sale: 'opt', rent: 'show' },
            labelOverrides: {
              external_stock: 'Finished on (mandate period)',
              rent: 'Finished on (tenancy / availability)'
            }
          },
          {
            key: 'ufCrm16_1790155057',
            crmCode: 'UF_CRM_16_1790155057',
            label: 'Available From',
            type: 'date',
            rules: { external_stock: 'show', off_plan: 'show', overseas_sale: 'show', rent: 'show' }
          },
          {
            key: 'ufCrm16CompletionDate',
            crmCode: 'UF_CRM_16_COMPLETION_DATE',
            label: 'Handover / Completion Date',
            type: 'date',
            rules: { external_stock: 'hide', off_plan: 'show', overseas_sale: 'opt', rent: 'hide' }
          },
          {
            key: 'ufCrm16CompletionStatus',
            crmCode: 'UF_CRM_16_COMPLETION_STATUS',
            label: 'Completion Status',
            type: 'enumeration',
            options: [
              { id: '702', value: 'Off-Plan' },
              { id: '704', value: 'Under Construction' },
              { id: '706', value: 'Completed' },
              { id: '708', value: 'Handover' },
              { id: '710', value: 'Ready' }
            ],
            rules: { external_stock: 'hide', off_plan: 'show', overseas_sale: 'opt', rent: 'hide' }
          },
          {
            key: 'ufCrm16Occupancy',
            crmCode: 'UF_CRM_16_OCCUPANCY',
            label: 'Tenancy Status',
            type: 'enumeration',
            options: [
              { id: '836', value: 'Vacant on Transfer' },
              { id: '838', value: 'Owner Occupied' },
              { id: '840', value: 'Rented' },
              { id: '842', value: 'Under Notice' },
              { id: '844', value: 'Vacant' }
            ],
            rules: { external_stock: 'opt', off_plan: 'hide', overseas_sale: 'opt', rent: 'show' }
          },
          {
            key: 'ufCrm16ExpirationDate',
            crmCode: 'UF_CRM_16_EXPIRATION_DATE',
            label: 'Tenancy End / Mandate Expiry Date',
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
            key: 'ufCrm16ReraPermitNumber',
            crmCode: 'UF_CRM_16_RERA_PERMIT_NUMBER',
            label: 'RERA Permit Number',
            type: 'string',
            placeholder: 'e.g. 7114829100',
            rules: { external_stock: 'opt', off_plan: 'show', overseas_sale: 'hide', rent: 'show' }
          },
          {
            key: 'ufCrm16_1791787455285',
            crmCode: 'UF_CRM_16_1791787455285',
            label: 'Trakheesi Permit No',
            type: 'string',
            placeholder: 'e.g. TRK-982145',
            rules: { external_stock: 'opt', off_plan: 'show', overseas_sale: 'hide', rent: 'show' }
          },
          {
            key: 'ufCrm16_1791787502111',
            crmCode: 'UF_CRM_16_1791787502111',
            label: 'Trakheesi Permit Expiry Date',
            type: 'date',
            rules: { external_stock: 'opt', off_plan: 'show', overseas_sale: 'hide', rent: 'show' }
          },
          {
            key: 'ufCrm16QrCodeLink',
            crmCode: 'UF_CRM_16_QR_CODE_LINK',
            label: 'DLD QR / Permit URL',
            type: 'url',
            placeholder: 'https://dubailand.gov.ae/en/eservices/licensing/...',
            rules: { external_stock: 'opt', off_plan: 'show', overseas_sale: 'hide', rent: 'show' }
          },
          {
            key: 'ufCrm16_1790155092',
            crmCode: 'UF_CRM_16_1790155092',
            label: 'Bayut Listing ID',
            type: 'string',
            placeholder: 'e.g. BYT-481902',
            rules: { external_stock: 'opt', off_plan: 'show', overseas_sale: 'hide', rent: 'show' }
          },
          {
            key: 'ufCrm16PropertyFinderListingId',
            crmCode: 'UF_CRM_16_PROPERTY_FINDER_LISTING_ID',
            label: 'Propertyfinder Listing ID',
            type: 'string',
            placeholder: 'e.g. PF-981273',
            rules: { external_stock: 'opt', off_plan: 'show', overseas_sale: 'hide', rent: 'show' }
          },
          {
            key: 'ufCrm16DubizzleRegion',
            crmCode: 'UF_CRM_16_DUBIZZLE_REGION',
            label: 'Dubizzle Listing ID / Region',
            type: 'string',
            placeholder: 'e.g. DBZ-558291',
            rules: { external_stock: 'opt', off_plan: 'show', overseas_sale: 'hide', rent: 'show' }
          },
          {
            key: 'ufCrm16SystemAllowedForPortals',
            crmCode: 'UF_CRM_16_SYSTEM_ALLOWED_FOR_PORTALS',
            label: 'Bayut / Dubizzle Feed Toggle',
            type: 'boolean',
            rules: { external_stock: 'opt', off_plan: 'show', overseas_sale: 'hide', rent: 'show' }
          },
          {
            key: 'ufCrm16SummaryDescription',
            crmCode: 'UF_CRM_16_SUMMARY_DESCRIPTION',
            label: 'Portal Title',
            type: 'string',
            placeholder: 'SEO Headline for Portals...',
            fullWidth: true,
            rules: { external_stock: 'opt', off_plan: 'show', overseas_sale: 'opt', rent: 'show' }
          },
          {
            key: 'ufCrm16Description',
            crmCode: 'UF_CRM_16_DESCRIPTION',
            label: 'Portal Description',
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
            key: 'ufCrm16_1791173118',
            crmCode: 'UF_CRM_16_1791173118',
            label: 'Primary Listing Image',
            type: 'file',
            isImage: true,
            rules: { external_stock: 'show', off_plan: 'show', overseas_sale: 'show', rent: 'show' }
          },
          {
            key: 'ufCrm16_1791881642219',
            crmCode: 'UF_CRM_16_1791881642219',
            label: 'Photos (Gallery)',
            type: 'file',
            isImage: true,
            isMultiple: true,
            rules: { external_stock: 'show', off_plan: 'show', overseas_sale: 'show', rent: 'show' }
          },
          {
            key: 'ufCrm16_1791172957',
            crmCode: 'UF_CRM_16_1791172957',
            label: 'Docs & Attachments',
            type: 'file',
            isDoc: true,
            rules: { external_stock: 'show', off_plan: 'show', overseas_sale: 'show', rent: 'show' }
          },
          {
            key: 'ufCrm16_1791544736052',
            crmCode: 'UF_CRM_16_1791544736052',
            label: 'Floor Plan',
            type: 'file',
            rules: { external_stock: 'opt', off_plan: 'show', overseas_sale: 'opt', rent: 'opt' }
          },
          {
            key: 'ufCrm16TitleDeed',
            crmCode: 'UF_CRM_16_TITLE_DEED',
            label: 'Title Deed / Ownership Proof',
            type: 'file',
            isDoc: true,
            rules: { external_stock: 'show', off_plan: 'opt', overseas_sale: 'show', rent: 'opt' }
          },
          {
            key: 'ufCrm16_1791787381785',
            crmCode: 'UF_CRM_16_1791787381785',
            label: 'Form A Document (Mandate Agreement)',
            type: 'file',
            isDoc: true,
            rules: { external_stock: 'show', off_plan: 'opt', overseas_sale: 'opt', rent: 'show' }
          },
          {
            key: 'ufCrm16WebsiteUrl',
            crmCode: 'UF_CRM_16_WEBSITE_URL',
            label: 'Brochure URL / File',
            type: 'url',
            placeholder: 'https://cdn.example.com/brochures/listing.pdf',
            rules: { external_stock: 'opt', off_plan: 'show', overseas_sale: 'show', rent: 'hide' }
          },
          {
            key: 'ufCrm16ListingWebsite',
            crmCode: 'UF_CRM_16_LISTING_WEBSITE',
            label: '360 Virtual Tour Link',
            type: 'tour_url',
            placeholder: 'https://my.matterport.com/show/?m=... or Kuula / YouTube 360',
            rules: { external_stock: 'opt', off_plan: 'opt', overseas_sale: 'opt', rent: 'opt' }
          }
        ]
      }
    ]
  };

  // State Management
  let currentListingId = null;
  let currentListing = {};
  let currentLayout = 'rent'; // Driven strictly by ufCrm16_1790154808
  let initialFormValues = {};
  let pendingFileUploads = {}; // fieldKey -> Array of { file, dataUrl, name, size }
  let isDirty = false;
  let allSectionsCollapsed = false;

  // DOM Elements
  const loadingEl = document.getElementById('loading');
  const contentEl = document.getElementById('content');
  const formEl = document.getElementById('listing-details-form');
  const sectionsContainer = document.getElementById('sections-container');
  const layoutModeBadge = document.getElementById('layout-mode-badge');
  const fieldsCountBadge = document.getElementById('fields-count-badge');
  const searchInput = document.getElementById('field-search-input');
  const clearSearchBtn = document.getElementById('btn-clear-search');
  const toggleAllBtn = document.getElementById('btn-toggle-all');
  const refreshBtn = document.getElementById('btn-refresh');
  const sectionNavPills = document.getElementById('section-nav-pills');
  const saveBtn = document.getElementById('btn-save');
  const cancelBtn = document.getElementById('btn-cancel');
  const dirtyIndicator = document.getElementById('dirty-indicator');
  const dirtyText = document.getElementById('dirty-text');

  // Lightbox Modal Elements (In same window)
  const lightboxModal = document.getElementById('lightbox-modal');
  const lightboxTitle = document.getElementById('lightbox-title');
  const lightboxBody = document.getElementById('lightbox-body');
  const lightboxDownloadLink = document.getElementById('lightbox-download-link');
  const lightboxCloseBtn = document.getElementById('lightbox-close-btn');

  // ============================================================================
  // 2. HELPER & UTILITY FUNCTIONS
  // ============================================================================
  function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 250);
    }, 3500);
  }

  function resizeWindow() {
    if (window.BX24 && typeof window.BX24.fitWindow === 'function') {
      window.BX24.fitWindow();
    }
  }

  function setDirty(state) {
    isDirty = state;
    if (dirtyIndicator) {
      dirtyIndicator.style.display = state ? 'inline-flex' : 'none';
      const pendingCount = Object.values(pendingFileUploads).reduce((acc, arr) => acc + arr.length, 0);
      dirtyText.textContent = pendingCount > 0 ? `Unsaved (${pendingCount} new files)` : 'Unsaved changes';
    }
    if (cancelBtn) {
      cancelBtn.style.display = state ? 'inline-flex' : 'none';
    }
  }

  function resolveListingId() {
    if (window.BX24 && typeof window.BX24.placement === 'object') {
      const placementInfo = window.BX24.placement.info();
      const options = placementInfo?.options;
      if (options) {
        if (typeof options === 'string') {
          try {
            const parsed = JSON.parse(options);
            return parsed.ID || parsed.id || parsed.ENTITY_ID;
          } catch (e) {}
        } else if (typeof options === 'object') {
          return options.ID || options.id || options.ENTITY_ID;
        }
      }
    }

    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('ID') || urlParams.get('id') || urlParams.get('listingId') || '108';
  }

  // Detects the layout strictly from the listing entity field
  function detectLayoutFromListing(listing) {
    const rawVal = listing?.[CONFIG.layoutField] || listing?.[CONFIG.layoutFieldCrm];
    if (!rawVal) return 'rent'; // default

    const strVal = String(rawVal).toLowerCase().trim();
    if (CONFIG.layoutEnumMap[strVal]) {
      return CONFIG.layoutEnumMap[strVal];
    }
    return 'rent';
  }

  // ============================================================================
  // 3. API DATA FETCHING & SAVING
  // ============================================================================
  function fetchListing(listingId) {
    return new Promise((resolve, reject) => {
      if (!window.BX24) {
        fetch(`/api/listing/${listingId}`)
          .then(r => r.json())
          .then(data => {
            if (data.success && data.item) resolve(data.item);
            else reject(new Error(data.error || 'Failed to fetch listing'));
          })
          .catch(reject);
        return;
      }

      window.BX24.callMethod('crm.item.get', {
        entityTypeId: CONFIG.entityTypeId,
        id: listingId
      }, res => {
        if (res.error()) {
          reject(new Error(res.error().toString()));
        } else {
          const item = res.data()?.item || res.data();
          resolve(item);
        }
      });
    });
  }

  function updateListing(listingId, fieldsPayload) {
    return new Promise((resolve, reject) => {
      if (!window.BX24) {
        fetch(`/api/listing/${listingId}/update`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fields: fieldsPayload })
        })
          .then(r => r.json())
          .then(data => {
            if (data.success) resolve(data.item);
            else reject(new Error(data.error || 'Update failed'));
          })
          .catch(reject);
        return;
      }

      window.BX24.callMethod('crm.item.update', {
        entityTypeId: CONFIG.entityTypeId,
        id: listingId,
        fields: fieldsPayload
      }, res => {
        if (res.error()) {
          reject(new Error(res.error().toString()));
        } else {
          resolve(res.data()?.item || res.data());
        }
      });
    });
  }

  // ============================================================================
  // 4. LIGHTBOX & DOCUMENT MODAL VIEWER (STRICTLY IN SAME IFRAME WINDOW)
  // ============================================================================
  function openLightbox(title, url, isPdf = false) {
    lightboxTitle.textContent = title || 'File Preview';
    lightboxDownloadLink.href = url;
    lightboxDownloadLink.setAttribute('download', title || 'download');

    lightboxBody.innerHTML = '';
    if (isPdf) {
      const iframe = document.createElement('iframe');
      iframe.className = 'lightbox-iframe';
      iframe.src = url;
      lightboxBody.appendChild(iframe);
    } else {
      const img = document.createElement('img');
      img.className = 'lightbox-img';
      img.src = url;
      img.alt = title;
      lightboxBody.appendChild(img);
    }

    lightboxModal.style.display = 'flex';
  }

  function closeLightbox() {
    lightboxModal.style.display = 'none';
    lightboxBody.innerHTML = '';
  }

  lightboxCloseBtn.addEventListener('click', closeLightbox);
  lightboxModal.addEventListener('click', (e) => {
    if (e.target === lightboxModal) closeLightbox();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && lightboxModal.style.display === 'flex') {
      closeLightbox();
    }
  });

  // ============================================================================
  // 5. IN-WINDOW MEDIA & FILE PREVIEW COMPONENT
  // ============================================================================
  function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  function renderMediaField(field, rawValue, container) {
    const card = document.createElement('div');
    card.className = 'file-upload-card';

    // 1. Dropzone Bar (Clean, single-line icon + text group)
    const dropzone = document.createElement('div');
    dropzone.className = 'dropzone-box';
    const isMulti = field.isMultiple || field.key.includes('DOCS') || field.key.includes('1791544736052') || field.key.includes('1791881642219');
    const uploadLabel = field.isImage ? (isMulti ? 'Upload Photos' : 'Upload Image') : (isMulti ? 'Upload Documents' : 'Upload Document');

    dropzone.innerHTML = `
      <span class="dropzone-icon">📁</span>
      <div class="dropzone-text-group">
        <span class="dropzone-title">${uploadLabel}</span>
        <span class="dropzone-sub">Click to browse or drop file</span>
      </div>
      <input type="file" id="file_input_${field.key}" style="display:none" ${isMulti ? 'multiple' : ''}>
    `;

    const fileInput = dropzone.querySelector('input');
    dropzone.addEventListener('click', () => fileInput.click());

    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.classList.add('dragover');
    });
    dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
      if (e.dataTransfer.files?.length) {
        handleLocalFiles(field.key, e.dataTransfer.files, viewportBox, stripWrap);
      }
    });

    fileInput.addEventListener('change', () => {
      if (fileInput.files?.length) {
        handleLocalFiles(field.key, fileInput.files, viewportBox, stripWrap);
      }
    });

    card.appendChild(dropzone);

    // 2. In-Window Inline Preview Viewport (Shows image in the same window!)
    const viewportBox = document.createElement('div');
    viewportBox.className = 'inline-preview-viewport';
    viewportBox.id = `viewport_${field.key}`;
    viewportBox.style.display = 'none'; // hidden initially until an image is loaded or selected

    const stripWrap = document.createElement('div');
    stripWrap.className = 'thumbnail-strip';
    stripWrap.id = `strip_${field.key}`;

    const docChipsWrap = document.createElement('div');
    docChipsWrap.className = 'doc-chips-wrap';
    docChipsWrap.style.display = 'none';

    // Collect all existing files
    const existingList = Array.isArray(rawValue) ? rawValue : (rawValue ? [rawValue] : []);
    let firstImageFound = null;

    existingList.forEach((fileItem, idx) => {
      if (!fileItem) return;

      let fileUrl = '';
      let fileName = '';

      if (typeof fileItem === 'object') {
        fileUrl = fileItem.showUrl || fileItem.downloadUrl || fileItem.url || '';
        fileName = fileItem.name || `${field.label} #${idx + 1}`;
      } else if (typeof fileItem === 'string' && fileItem.startsWith('http')) {
        fileUrl = fileItem;
        fileName = fileItem.split('/').pop().split('?')[0] || 'Attached File';
      }

      if (!fileUrl && !fileName) return;

      const domain = window.__BITRIX_DOMAIN__ || (window.location ? window.location.hostname : 'csl.bitrix24.com');
      const fullUrl = fileUrl.startsWith('http') ? fileUrl : `https://${domain}${fileUrl}`;
      const isImage = field.isImage || /\.(png|jpe?g|webp|gif|svg)($|\?)/i.test(fileName || fullUrl);
      const isPdf = /\.pdf($|\?)/i.test(fileName || fullUrl);

      if (isImage) {
        if (!firstImageFound) {
          firstImageFound = { url: fullUrl, name: fileName };
        }

        const thumb = document.createElement('div');
        thumb.className = 'thumb-item preview-thumb-wrap';
        thumb.title = fileName;
        thumb.innerHTML = `
          <img class="thumb-item-img" src="${fullUrl}" alt="${fileName}">
          <div class="thumb-zoom-overlay">🔍</div>
        `;
        
        // Clicking thumbnail swaps image in the same window viewport!
        thumb.addEventListener('click', () => {
          showInWindowImage(viewportBox, fullUrl, fileName);
          stripWrap.querySelectorAll('.thumb-item').forEach(t => t.classList.remove('active'));
          thumb.classList.add('active');
        });

        stripWrap.appendChild(thumb);
      } else {
        // Document chip
        const docChip = document.createElement('div');
        docChip.className = 'doc-chip-item preview-doc-wrap';
        docChip.innerHTML = `
          <span class="doc-chip-badge">${isPdf ? 'PDF' : 'DOC'}</span>
          <span class="doc-chip-name" title="${fileName}">${fileName}</span>
          ${isPdf ? `<button type="button" class="doc-chip-view-btn">View</button>` : ''}
          <a href="${fullUrl}" download class="doc-chip-view-btn" title="Download">⬇</a>
        `;
        if (isPdf) {
          docChip.querySelector('button').addEventListener('click', () => {
            showInWindowPdf(viewportBox, fullUrl, fileName);
          });
        }
        docChipsWrap.appendChild(docChip);
        docChipsWrap.style.display = 'flex';
      }
    });

    // Automatically display first image in the same window viewport on load!
    if (firstImageFound) {
      showInWindowImage(viewportBox, firstImageFound.url, firstImageFound.name);
      if (stripWrap.firstChild) {
        stripWrap.firstChild.classList.add('active');
      }
    }

    card.appendChild(docChipsWrap);
    card.appendChild(viewportBox);
    card.appendChild(stripWrap);
    container.appendChild(card);
  }

  // Shows an image directly inside the inline viewport in the same window
  function showInWindowImage(viewportBox, url, name) {
    viewportBox.style.display = 'flex';
    viewportBox.innerHTML = `
      <div class="inline-preview-topbar">
        <span class="inline-preview-name">👁 Preview: ${name}</span>
        <div style="display:flex; gap:6px; align-items:center;">
          <button type="button" class="btn btn-secondary btn-compact zoom-btn" style="height:20px; font-size:10px; padding:0 6px;">🔍 Zoom</button>
          <button type="button" class="inline-preview-close" title="Hide Preview">✕</button>
        </div>
      </div>
      <img class="inline-preview-img" src="${url}" alt="${name}">
    `;

    viewportBox.querySelector('.zoom-btn').addEventListener('click', () => openLightbox(name, url, false));
    viewportBox.querySelector('.inline-preview-close').addEventListener('click', () => {
      viewportBox.style.display = 'none';
      viewportBox.innerHTML = '';
      resizeWindow();
    });
    resizeWindow();
  }

  // Shows a PDF directly inside the inline viewport in the same window
  function showInWindowPdf(viewportBox, url, name) {
    viewportBox.style.display = 'flex';
    viewportBox.innerHTML = `
      <div class="inline-preview-topbar">
        <span class="inline-preview-name">📄 PDF Viewer: ${name}</span>
        <button type="button" class="inline-preview-close" title="Hide PDF">✕</button>
      </div>
      <iframe class="inline-preview-iframe" src="${url}"></iframe>
    `;

    viewportBox.querySelector('.inline-preview-close').addEventListener('click', () => {
      viewportBox.style.display = 'none';
      viewportBox.innerHTML = '';
      resizeWindow();
    });
    resizeWindow();
  }

  // Handle local newly selected files with instant in-window FileReader preview
  function handleLocalFiles(fieldKey, files, viewportBox, stripWrap) {
    if (!pendingFileUploads[fieldKey]) {
      pendingFileUploads[fieldKey] = [];
    }

    Array.from(files).forEach(file => {
      const isImage = file.type.startsWith('image/');
      const isPdf = file.type === 'application/pdf' || file.name.endsWith('.pdf');
      const reader = new FileReader();

      reader.onload = function (e) {
        const dataUrl = e.target.result;
        const pendingItem = {
          file,
          dataUrl,
          name: file.name,
          size: file.size,
          isImage,
          isPdf
        };
        pendingFileUploads[fieldKey].push(pendingItem);
        setDirty(true);

        if (isImage) {
          // Immediately show newly selected image in the same window viewport!
          showInWindowImage(viewportBox, dataUrl, `${file.name} (New)`);

          // Append thumbnail to strip
          const thumb = document.createElement('div');
          thumb.className = 'thumb-item preview-thumb-wrap active';
          thumb.title = `${file.name} (Ready to upload)`;
          thumb.innerHTML = `
            <img class="thumb-item-img" src="${dataUrl}" alt="${file.name}">
            <div class="thumb-zoom-overlay">🔍</div>
            <button type="button" class="thumb-remove-btn" title="Remove">✕</button>
          `;

          thumb.addEventListener('click', (ev) => {
            if (ev.target.classList.contains('thumb-remove-btn')) return;
            showInWindowImage(viewportBox, dataUrl, file.name);
            stripWrap.querySelectorAll('.thumb-item').forEach(t => t.classList.remove('active'));
            thumb.classList.add('active');
          });

          thumb.querySelector('.thumb-remove-btn').addEventListener('click', (ev) => {
            ev.stopPropagation();
            const idx = pendingFileUploads[fieldKey].indexOf(pendingItem);
            if (idx > -1) pendingFileUploads[fieldKey].splice(idx, 1);
            thumb.remove();
            viewportBox.style.display = 'none';
            viewportBox.innerHTML = '';
            setDirty(true);
            resizeWindow();
          });

          stripWrap.querySelectorAll('.thumb-item').forEach(t => t.classList.remove('active'));
          stripWrap.appendChild(thumb);
        } else if (isPdf) {
          showInWindowPdf(viewportBox, dataUrl, `${file.name} (New)`);
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
    sectionsContainer.innerHTML = '';
    sectionNavPills.innerHTML = '';
    initialFormValues = {};

    let totalActiveFieldsCount = 0;

    CONFIG.sections.forEach((sec, secIdx) => {
      const activeFields = [];

      sec.fields.forEach(f => {
        const rule = f.rules?.[layoutKey] || 'show';
        if (rule !== 'hide') {
          activeFields.push(f);
        }
      });

      const sectionActiveCount = activeFields.length;
      totalActiveFieldsCount += sectionActiveCount;

      if (sectionActiveCount === 0) return;

      // Jump-to Navigation Pill
      const pill = document.createElement('button');
      pill.type = 'button';
      pill.className = `nav-pill ${secIdx === 0 ? 'active' : ''}`;
      pill.setAttribute('data-target-sec', sec.id);
      pill.innerHTML = `<span>${sec.icon} ${sec.title}</span><span class="nav-pill-count">${sectionActiveCount}</span>`;
      pill.addEventListener('click', () => {
        document.querySelectorAll('.nav-pill').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        const targetEl = document.getElementById(`sec_${sec.id}`);
        if (targetEl) {
          targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
      sectionNavPills.appendChild(pill);

      // Section Card
      const card = document.createElement('div');
      card.className = 'section-card';
      card.id = `sec_${sec.id}`;

      // Card Header (Minimal)
      const header = document.createElement('div');
      header.className = 'section-header';
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
      header.addEventListener('click', () => {
        card.classList.toggle('collapsed');
      });
      card.appendChild(header);

      // Card Body
      const body = document.createElement('div');
      body.className = 'section-body';

      // Primary Grid (renders all active fields in section order)
      const primaryGrid = document.createElement('div');
      primaryGrid.className = 'fields-grid';

      activeFields.forEach(f => {
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
    const lookupTypes = ['crm_company', 'crm_contact', 'crm_contact_multi', 'crm_entity', 'user', 'crm'];
    if (lookupTypes.includes(f.type)) return true;
    if (f.key === 'companyId' || f.key === 'contactId' || f.key === 'contactIds' || f.key === 'assignedById') return true;
    if (f.key && f.key.startsWith('parentId')) return true;
    return false;
  }

  function getEntityMeta(type, key) {
    if (type === 'crm_company' || key === 'companyId') {
      return { icon: '🏢', label: 'Company', defaultPrefix: 'Company #' };
    }
    if (type === 'crm_contact' || key === 'contactId') {
      return { icon: '👤', label: 'Contact', defaultPrefix: 'Contact #' };
    }
    if (type === 'crm_contact_multi' || key === 'contactIds') {
      return { icon: '👥', label: 'Contact', defaultPrefix: 'Contact #' };
    }
    if (type === 'user' || key === 'assignedById') {
      return { icon: '👤', label: 'Responsible Person', defaultPrefix: 'User #' };
    }
    if (key === 'parentId1052') {
      return { icon: '🏗️', label: 'Master Property', defaultPrefix: 'Master Property #' };
    }
    return { icon: '🔗', label: 'CRM Entity', defaultPrefix: 'Record #' };
  }

  function getEntityPath(type, rawId, key) {
    if (!rawId) return '';
    const idStr = String(rawId).trim();

    if (idStr.startsWith('CO_')) {
      return `/crm/company/details/${idStr.replace(/^CO_/, '')}/`;
    }
    if (idStr.startsWith('C_')) {
      return `/crm/contact/details/${idStr.replace(/^C_/, '')}/`;
    }
    if (idStr.startsWith('D_')) {
      return `/crm/deal/details/${idStr.replace(/^D_/, '')}/`;
    }
    if (idStr.startsWith('L_')) {
      return `/crm/lead/details/${idStr.replace(/^L_/, '')}/`;
    }
    if (/^T[0-9a-fA-F]+_(\d+)$/.test(idStr)) {
      const parts = idStr.split('_');
      const hex = parts[0].substring(1);
      const spTypeId = parseInt(hex, 16) || 1052;
      return `/crm/type/${spTypeId}/details/${parts[1]}/`;
    }

    const num = idStr.replace(/[^\d]/g, '');
    if (!num) return '';

    if (type === 'crm_company' || key === 'companyId') {
      return `/crm/company/details/${num}/`;
    }
    if (type === 'crm_contact' || type === 'crm_contact_multi' || key === 'contactId' || key === 'contactIds') {
      return `/crm/contact/details/${num}/`;
    }
    if (type === 'user' || key === 'assignedById') {
      return `/company/personal/user/${num}/`;
    }
    if (key === 'parentId1052' || type === 'crm_entity') {
      return `/crm/type/1052/details/${num}/`;
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
      showToast('No valid linked record ID to open', 'warning');
      return;
    }

    if (window.BX24 && typeof window.BX24.openPath === 'function') {
      window.BX24.openPath(path);
    } else {
      const domain = window.__BITRIX_DOMAIN__ || (window.location ? window.location.hostname : 'csl.bitrix24.com');
      const fullUrl = path.startsWith('http') ? path : `https://${domain}${path}`;
      window.open(fullUrl, '_blank');
    }
  }

  function fetchEntityTitle(type, id, key, callback) {
    if (!id) return;
    const cacheKey = `${type}_${id}`;
    if (entityTitleCache[cacheKey]) {
      callback(entityTitleCache[cacheKey]);
      return;
    }
    if (!window.BX24 || typeof window.BX24.callMethod !== 'function') return;

    const num = String(id).replace(/[^\d]/g, '');
    if (!num) return;

    if (type === 'crm_company' || key === 'companyId') {
      window.BX24.callMethod('crm.company.get', { id: num }, res => {
        if (!res.error() && res.data()?.TITLE) {
          entityTitleCache[cacheKey] = res.data().TITLE;
          callback(res.data().TITLE);
        }
      });
    } else if (type === 'crm_contact' || type === 'crm_contact_multi' || key === 'contactId' || key === 'contactIds') {
      window.BX24.callMethod('crm.contact.get', { id: num }, res => {
        if (!res.error()) {
          const d = res.data();
          const name = [d?.NAME, d?.LAST_NAME].filter(Boolean).join(' ') || d?.NAME;
          if (name) {
            entityTitleCache[cacheKey] = name;
            callback(name);
          }
        }
      });
    } else if (type === 'user' || key === 'assignedById') {
      window.BX24.callMethod('user.get', { ID: num }, res => {
        if (!res.error() && res.data()?.[0]) {
          const u = res.data()[0];
          const name = [u.NAME, u.LAST_NAME].filter(Boolean).join(' ') || u.LOGIN;
          if (name) {
            entityTitleCache[cacheKey] = name;
            callback(name);
          }
        }
      });
    } else if (key === 'parentId1052' || type === 'crm_entity') {
      window.BX24.callMethod('crm.item.get', { entityTypeId: 1052, id: num }, res => {
        if (!res.error()) {
          const item = res.data()?.item || res.data();
          const title = item?.title || item?.TITLE || res.data()?.TITLE;
          if (title) {
            entityTitleCache[cacheKey] = title;
            callback(title);
          }
        }
      });
    }
  }

  function renderLookupField(f, rawVal, group, displayLabel) {
    const meta = getEntityMeta(f.type, f.key);
    const wrap = document.createElement('div');
    wrap.className = 'lookup-input-wrap';

    const input = document.createElement('input');
    input.id = `field_${f.key}`;
    input.name = f.key;
    input.type = 'text';
    input.className = 'form-control';
    input.placeholder = f.placeholder || `Enter ${displayLabel} ID or name...`;

    let rawIdStr = '';
    if (Array.isArray(rawVal)) {
      rawIdStr = rawVal.map(v => typeof v === 'object' ? (v.id || v.ID || JSON.stringify(v)) : v).join(', ');
    } else if (rawVal && typeof rawVal === 'object') {
      rawIdStr = String(rawVal.id || rawVal.ID || rawVal.value || '');
    } else if (rawVal !== null && rawVal !== undefined) {
      rawIdStr = String(rawVal);
    }
    input.dataset.id = rawIdStr;

    // Check if known title is already present on listing object
    let knownTitle = '';
    if (rawVal && typeof rawVal === 'object' && (rawVal.title || rawVal.name)) {
      knownTitle = rawVal.title || rawVal.name;
    } else if (f.key === 'companyId' && currentListing.company?.title) {
      knownTitle = currentListing.company.title;
    } else if (f.key === 'contactId' && currentListing.contact?.name) {
      knownTitle = currentListing.contact.name;
    } else if (f.key === 'assignedById' && currentListing.assignedBy?.name) {
      knownTitle = currentListing.assignedBy.name;
    } else if (f.key === 'parentId1052' && currentListing.parentId1052?.title) {
      knownTitle = currentListing.parentId1052.title;
    } else if (currentListing[`${f.key}_TITLE`]) {
      knownTitle = currentListing[`${f.key}_TITLE`];
    } else if (currentListing[`${f.key}_NAME`]) {
      knownTitle = currentListing[`${f.key}_NAME`];
    }

    const hasValidId = rawIdStr && rawIdStr !== '0';

    // Show title directly inside the input field
    if (knownTitle) {
      input.value = knownTitle;
      input.title = `${knownTitle} (ID: ${rawIdStr})`;
    } else if (hasValidId) {
      input.value = `#${rawIdStr}`;
      input.title = `${meta.label} ID: ${rawIdStr}`;
    } else {
      input.value = '';
    }

    // Open button: arrow only!
    const openBtn = document.createElement('button');
    openBtn.type = 'button';
    openBtn.className = 'lookup-open-btn';
    openBtn.innerHTML = `<span>↗</span>`;
    openBtn.title = `Open linked ${meta.label} in Bitrix24`;
    openBtn.style.display = hasValidId ? 'inline-flex' : 'none';

    // Fetch title in background and display title inside field
    if (hasValidId && !knownTitle) {
      fetchEntityTitle(f.type, rawIdStr, f.key, (resolvedTitle) => {
        if (resolvedTitle && (input.dataset.id === rawIdStr || !input.value || input.value === `#${rawIdStr}`)) {
          input.value = resolvedTitle;
          input.title = `${resolvedTitle} (ID: ${rawIdStr})`;
        }
      });
    }

    openBtn.addEventListener('click', (e) => {
      const currentTargetId = input.dataset.id || input.value.trim();
      const firstId = currentTargetId.includes(',') ? currentTargetId.split(',')[0].trim() : currentTargetId;
      openLinkedRecord(f.type, firstId, f.key, e);
    });

    input.addEventListener('input', () => {
      const val = input.value.trim();
      input.dataset.id = val;
      setDirty(true);
      openBtn.style.display = (val && val !== '0') ? 'inline-flex' : 'none';
    });

    input.addEventListener('blur', () => {
      const val = input.value.trim();
      if (val && /^\d+$/.test(val)) {
        fetchEntityTitle(f.type, val, f.key, (resolvedTitle) => {
          if (resolvedTitle && input.dataset.id === val) {
            input.value = resolvedTitle;
            input.title = `${resolvedTitle} (ID: ${val})`;
          }
        });
      }
    });

    wrap.appendChild(input);
    wrap.appendChild(openBtn);
    group.appendChild(wrap);
    initialFormValues[f.key] = input.dataset.id || input.value;
  }

  // Field element factory
  function createFieldElement(f, layoutKey) {
    const group = document.createElement('div');
    group.className = `field-group ${f.fullWidth ? 'full-width' : ''}`;
    group.setAttribute('data-field-key', f.key);

    const displayLabel = f.labelOverrides?.[layoutKey] || f.label;
    const labelEl = document.createElement('label');
    labelEl.className = 'field-label';
    labelEl.setAttribute('for', `field_${f.key}`);
    labelEl.innerHTML = `
      <span>${displayLabel}</span>
      ${f.labelOverrides?.[layoutKey] ? `<span class="field-context-hint">${layoutKey.replace('_', ' ')}</span>` : ''}
    `;
    group.appendChild(labelEl);

    const rawVal = (currentListing[f.key] !== undefined && currentListing[f.key] !== null)
      ? currentListing[f.key]
      : (f.crmCode && currentListing[f.crmCode] !== undefined ? currentListing[f.crmCode] : undefined);

    if (f.type === 'file') {
      renderMediaField(f, rawVal, group);
    } else if (isLookupField(f)) {
      renderLookupField(f, rawVal, group, displayLabel);
    } else if (f.type === 'tour_url') {
      const card = document.createElement('div');
      card.className = 'file-upload-card media-url-card';

      const wrap = document.createElement('div');
      wrap.className = 'media-url-input-wrap';

      const input = document.createElement('input');
      input.type = 'url';
      input.id = `field_${f.key}`;
      input.name = f.key;
      input.className = 'form-control';
      input.placeholder = f.placeholder || 'https://my.matterport.com/show/?m=...';
      input.value = rawVal || '';
      input.addEventListener('input', () => setDirty(true));

      const launchBtn = document.createElement('button');
      launchBtn.type = 'button';
      launchBtn.className = 'btn btn-secondary launch-tour-btn';
      launchBtn.innerHTML = `<span>🌐 Launch 360</span>`;
      launchBtn.title = 'Open interactive 360 tour preview';
      launchBtn.addEventListener('click', () => {
        if (!input.value) {
          showToast('Please enter a 360 Virtual Tour URL first', 'warning');
          return;
        }
        openLightbox('360 Virtual Tour Preview', input.value, true);
      });

      wrap.appendChild(input);
      wrap.appendChild(launchBtn);
      card.appendChild(wrap);
      group.appendChild(card);
      initialFormValues[f.key] = input.value;
    } else if (f.type === 'url') {
      const card = document.createElement('div');
      card.className = 'file-upload-card media-url-card';

      const wrap = document.createElement('div');
      wrap.className = 'media-url-input-wrap';

      const input = document.createElement('input');
      input.type = 'url';
      input.id = `field_${f.key}`;
      input.name = f.key;
      input.className = 'form-control';
      input.placeholder = f.placeholder || 'https://...';
      input.value = rawVal || '';
      input.addEventListener('input', () => setDirty(true));

      const testBtn = document.createElement('a');
      testBtn.href = rawVal || '#';
      testBtn.target = '_self';
      testBtn.className = 'btn btn-secondary launch-tour-btn';
      testBtn.textContent = '↗ Open';
      testBtn.addEventListener('click', (e) => {
        if (!input.value) e.preventDefault();
        else openLightbox('Preview', input.value, true);
      });

      wrap.appendChild(input);
      wrap.appendChild(testBtn);
      card.appendChild(wrap);
      group.appendChild(card);
      initialFormValues[f.key] = input.value;
    } else if (f.type === 'textarea') {
      const textarea = document.createElement('textarea');
      textarea.id = `field_${f.key}`;
      textarea.name = f.key;
      textarea.className = 'form-control';
      textarea.placeholder = f.placeholder || '';
      textarea.value = rawVal || '';
      textarea.rows = 2;
      textarea.addEventListener('input', () => setDirty(true));
      group.appendChild(textarea);
      initialFormValues[f.key] = textarea.value;
    } else if (f.type === 'enumeration') {
      const select = document.createElement('select');
      select.id = `field_${f.key}`;
      select.name = f.key;
      select.className = 'form-control';

      const defOpt = document.createElement('option');
      defOpt.value = '';
      defOpt.textContent = `-- Select ${displayLabel} --`;
      select.appendChild(defOpt);

      const rawStr = (rawVal !== null && rawVal !== undefined) ? String(rawVal).trim().toLowerCase() : '';
      const options = f.options || [];
      options.forEach(opt => {
        const optionEl = document.createElement('option');
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
        select.addEventListener('change', () => {
          const selectedEnumId = select.value;
          const mappedLayout = CONFIG.layoutEnumMap[selectedEnumId] || 'rent';
          showToast(`Layout updated to ${CONFIG.layoutMeta[mappedLayout].title}`, 'info');
          currentListing[f.key] = selectedEnumId;
          renderLayout(mappedLayout);
          setDirty(true);
        });
      } else {
        select.addEventListener('change', () => setDirty(true));
      }

      group.appendChild(select);
      initialFormValues[f.key] = select.value;
    } else if (f.type === 'boolean') {
      const select = document.createElement('select');
      select.id = `field_${f.key}`;
      select.name = f.key;
      select.className = 'form-control';
      select.innerHTML = `
        <option value="">-- Select --</option>
        <option value="Y" ${rawVal === 'Y' || rawVal === true || rawVal === 1 ? 'selected' : ''}>Yes</option>
        <option value="N" ${rawVal === 'N' || rawVal === false || rawVal === 0 ? 'selected' : ''}>No</option>
      `;
      select.addEventListener('change', () => setDirty(true));
      group.appendChild(select);
      initialFormValues[f.key] = select.value;
    } else if (f.type === 'address') {
      const input = document.createElement('input');
      input.id = `field_${f.key}`;
      input.name = f.key;
      input.type = 'text';
      input.className = 'form-control';
      input.placeholder = f.placeholder || 'Street, building, area...';
      if (rawVal && typeof rawVal === 'object') {
        input.value = rawVal.text || rawVal.street || Object.values(rawVal).filter(v => typeof v === 'string').join(', ') || '';
      } else {
        input.value = (rawVal !== null && rawVal !== undefined) ? rawVal : '';
      }
      input.addEventListener('input', () => setDirty(true));
      group.appendChild(input);
      initialFormValues[f.key] = input.value;
    } else {
      const isAddon = !!f.addon;
      const input = document.createElement('input');
      input.id = `field_${f.key}`;
      input.name = f.key;
      input.className = 'form-control';
      input.placeholder = f.placeholder || '';

      let displayVal = rawVal;
      if (displayVal !== null && displayVal !== undefined && typeof displayVal === 'object') {
        displayVal = displayVal.title || displayVal.name || displayVal.id || displayVal.value || '';
      }
      input.value = (displayVal !== null && displayVal !== undefined) ? displayVal : '';

      if (f.type === 'number' || f.type === 'money' || f.type === 'integer') {
        input.type = 'number';
        input.step = f.type === 'integer' ? '1' : 'any';
      } else if (f.type === 'date') {
        input.type = 'date';
        if (displayVal && typeof displayVal === 'string' && displayVal.length >= 10) {
          if (displayVal.includes('.')) {
            const parts = displayVal.split('.');
            if (parts.length === 3) {
              input.value = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
            } else {
              input.value = displayVal.slice(0, 10);
            }
          } else {
            input.value = displayVal.slice(0, 10);
          }
        }
      } else {
        input.type = 'text';
      }

      input.addEventListener('input', () => setDirty(true));

      if (isAddon) {
        const addonWrap = document.createElement('div');
        addonWrap.className = 'input-addon-group';
        addonWrap.appendChild(input);
        const addonSpan = document.createElement('span');
        addonSpan.className = 'input-addon';
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
  searchInput.addEventListener('input', () => {
    const q = searchInput.value.toLowerCase().trim();
    clearSearchBtn.style.display = q ? 'block' : 'none';

    document.querySelectorAll('.field-group').forEach(group => {
      const text = group.textContent.toLowerCase();
      group.style.display = (!q || text.includes(q)) ? '' : 'none';
    });
  });

  clearSearchBtn.addEventListener('click', () => {
    searchInput.value = '';
    clearSearchBtn.style.display = 'none';
    document.querySelectorAll('.field-group').forEach(group => {
      group.style.display = '';
    });
  });

  // Toggle all sections
  toggleAllBtn.addEventListener('click', () => {
    allSectionsCollapsed = !allSectionsCollapsed;
    document.querySelectorAll('.section-card').forEach(card => {
      card.classList.toggle('collapsed', allSectionsCollapsed);
    });
    toggleAllBtn.textContent = allSectionsCollapsed ? 'Expand All' : 'Collapse All';
  });

  // Refresh
  refreshBtn.addEventListener('click', () => {
    loadListingDetails();
  });

  // Cancel
  cancelBtn.addEventListener('click', () => {
    if (confirm('Discard all unsaved changes and reload original listing data?')) {
      loadListingDetails();
    }
  });

  // Save changes
  formEl.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!currentListingId) return;

    saveBtn.disabled = true;
    saveBtn.innerHTML = '⏳ &nbsp;SAVING...';

    try {
      const payload = {};

      const formData = new FormData(formEl);
      for (const [key, val] of formData.entries()) {
        payload[key] = val;
      }

      document.querySelectorAll('#sections-container input, #sections-container select, #sections-container textarea').forEach(el => {
        if (el.name && el.type !== 'file') {
          payload[el.name] = (el.dataset.id !== undefined && el.dataset.id !== '') ? el.dataset.id : el.value;
        }
      });

      if (payload['contactIds'] && typeof payload['contactIds'] === 'string' && payload['contactIds'].includes(',')) {
        payload['contactIds'] = payload['contactIds'].split(',').map(s => s.trim()).filter(Boolean);
      }

      // Package pending file uploads with { fileData: [name, base64] }
      for (const [fieldKey, fileList] of Object.entries(pendingFileUploads)) {
        if (fileList.length === 1) {
          const item = fileList[0];
          const base64 = item.dataUrl.split(',')[1] || '';
          payload[fieldKey] = { fileData: [item.name, base64] };
        } else if (fileList.length > 1) {
          payload[fieldKey] = fileList.map(item => ({
            fileData: [item.name, item.dataUrl.split(',')[1] || '']
          }));
        }
      }

      console.log('[LISTING] Saving payload:', payload);
      await updateListing(currentListingId, payload);

      showToast('✓ Listing updated successfully in Bitrix24!', 'success');
      pendingFileUploads = {};
      setDirty(false);

      await loadListingDetails(false);
    } catch (err) {
      console.error('Failed to save listing:', err);
      showToast(`Save failed: ${err.message}`, 'error');
    } finally {
      saveBtn.disabled = false;
      saveBtn.innerHTML = '✓ &nbsp;SAVE CHANGES';
    }
  });

  // ============================================================================
  // 8. INITIALIZATION
  // ============================================================================
  async function loadListingDetails(showLoader = true) {
    if (showLoader) {
      loadingEl.style.display = 'flex';
      contentEl.style.display = 'none';
    }

    try {
      currentListingId = resolveListingId();
      if (!currentListingId) {
        throw new Error('No Listing ID detected. Open from Listing CRM detail card or pass ?ID=108');
      }

      console.log(`[LISTING] Loading listing #${currentListingId}...`);
      currentListing = await fetchListing(currentListingId);
      console.log('[LISTING] Loaded item data:', currentListing);

      // Render strictly driven by the field value
      const layoutKey = detectLayoutFromListing(currentListing);
      renderLayout(layoutKey);

      setDirty(false);
      loadingEl.style.display = 'none';
      contentEl.style.display = 'block';
    } catch (err) {
      console.error('[LISTING] Init error:', err);
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
    openLightbox,
    closeLightbox,
    showInWindowImage,
    showInWindowPdf,
    openLinkedRecord,
    getEntityPath,
    isLookupField,
    getEntityMeta
  };

  if (window.BX24) {
    window.BX24.init(() => loadListingDetails(true));
  } else {
    window.addEventListener('DOMContentLoaded', () => loadListingDetails(true));
  }
})();
