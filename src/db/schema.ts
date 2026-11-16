import { relations } from 'drizzle-orm';
import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

export const userRoleEnum = pgEnum('user_role', ['customer', 'owner', 'admin']);
export const businessStatusEnum = pgEnum('business_status', ['draft', 'published', 'suspended']);
export const verificationStatusEnum = pgEnum('verification_status', [
  'not_requested',
  'pending',
  'approved',
  'rejected',
]);
export const postTypeEnum = pgEnum('post_type', ['photo', 'video']);
export const productTypeEnum = pgEnum('product_type', ['product', 'service']);
export const availabilityEnum = pgEnum('availability_status', [
  'in_stock',
  'low_stock',
  'out_of_stock',
  'not_tracked',
]);
export const stockMovementTypeEnum = pgEnum('stock_movement_type', ['in', 'out', 'adjust']);
export const reviewStatusEnum = pgEnum('review_status', ['visible', 'hidden']);
export const enquiryStatusEnum = pgEnum('enquiry_status', ['new', 'read', 'replied']);
export const verificationRequestStatusEnum = pgEnum('verification_request_status', [
  'pending',
  'approved',
  'rejected',
]);
export const reportTargetTypeEnum = pgEnum('report_target_type', ['business', 'review', 'post']);
export const reportStatusEnum = pgEnum('report_status', ['open', 'dismissed', 'actioned']);

export interface BusinessDayHours {
  open: string;
  close: string;
  closed: boolean;
}

export type BusinessHoursMap = Record<string, BusinessDayHours>;

export interface SocialLinksMap {
  instagram?: string;
  facebook?: string;
  youtube?: string;
  x?: string;
  linkedin?: string;
  website?: string;
}

export const profiles = pgTable(
  'profiles',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    uid: text('uid').notNull().unique(),
    email: text('email').notNull(),
    fullName: text('full_name').notNull().default(''),
    handle: text('handle'),
    bio: text('bio').default(''),
    city: text('city').default(''),
    phone: text('phone').default(''),
    avatarUrl: text('avatar_url').default(''),
    role: userRoleEnum('role').notNull().default('customer'),
    preferredLang: text('preferred_lang').notNull().default('en'),
    businessAccessUntil: timestamp('business_access_until'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [index('profiles_handle_idx').on(table.handle)]
);

export const categories = pgTable('categories', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  parentId: uuid('parent_id'),
  icon: text('icon').notNull().default('store'),
  sortOrder: integer('sort_order').notNull().default(0),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const businesses = pgTable('businesses', {
  id: uuid('id').defaultRandom().primaryKey(),
  ownerId: uuid('owner_id')
    .references(() => profiles.id, { onDelete: 'cascade' })
    .notNull(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  categoryId: uuid('category_id')
    .references(() => categories.id, { onDelete: 'set null' }),
  subcategory: text('subcategory').default(''),
  bio: text('bio').default(''),
  phone: text('phone').default(''),
  whatsapp: text('whatsapp').default(''),
  email: text('email').default(''),
  website: text('website').default(''),
  upiId: text('upi_id').default(''),
  googleMapsUrl: text('google_maps_url').default(''),
  addressLine: text('address_line').default(''),
  area: text('area').default(''),
  city: text('city').default(''),
  state: text('state').default(''),
  pincode: text('pincode').default(''),
  country: text('country').notNull().default('IN'),
  lat: doublePrecision('lat').notNull().default(25.5941),
  lng: doublePrecision('lng').notNull().default(85.1376),
  logoUrl: text('logo_url').default(''),
  coverUrl: text('cover_url').default(''),
  hours: jsonb('hours').$type<BusinessHoursMap>().default({}),
  socialLinks: jsonb('social_links').$type<SocialLinksMap>().default({}),
  tags: text('tags').array().default([]),
  status: businessStatusEnum('status').notNull().default('published'),
  verificationStatus: verificationStatusEnum('verification_status')
    .notNull()
    .default('not_requested'),
  isVerified: boolean('is_verified').notNull().default(false),
  plan: text('plan').notNull().default('free'),
  ratingAvg: numeric('rating_avg', { precision: 3, scale: 2 }).notNull().default('0'),
  ratingCount: integer('rating_count').notNull().default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const posts = pgTable('posts', {
  id: uuid('id').defaultRandom().primaryKey(),
  businessId: uuid('business_id')
    .references(() => businesses.id, { onDelete: 'cascade' })
    .notNull(),
  type: postTypeEnum('type').notNull().default('photo'),
  mediaUrl: text('media_url').notNull(),
  posterUrl: text('poster_url').default(''),
  caption: text('caption').default(''),
  trimStartSec: doublePrecision('trim_start_sec').default(0),
  trimEndSec: doublePrecision('trim_end_sec'),
  durationSec: doublePrecision('duration_sec'),
  isPinned: boolean('is_pinned').notNull().default(false),
  sortOrder: integer('sort_order').notNull().default(0),
  isHidden: boolean('is_hidden').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const products = pgTable('products', {
  id: uuid('id').defaultRandom().primaryKey(),
  businessId: uuid('business_id')
    .references(() => businesses.id, { onDelete: 'cascade' })
    .notNull(),
  type: productTypeEnum('type').notNull().default('product'),
  name: text('name').notNull(),
  description: text('description').default(''),
  categoryLabel: text('category_label').default(''),
  price: numeric('price', { precision: 12, scale: 2 }).notNull().default('0'),
  discountPrice: numeric('discount_price', { precision: 12, scale: 2 }),
  unit: text('unit').default('unit'),
  durationMinutes: integer('duration_minutes'),
  sku: text('sku').default(''),
  images: text('images').array().default([]),
  tags: text('tags').array().default([]),
  isActive: boolean('is_active').notNull().default(true),
  availability: availabilityEnum('availability').notNull().default('in_stock'),
  viewCount: integer('view_count').notNull().default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const inventory = pgTable('inventory', {
  productId: uuid('product_id')
    .references(() => products.id, { onDelete: 'cascade' })
    .primaryKey(),
  quantity: integer('quantity').notNull().default(0),
  costPrice: numeric('cost_price', { precision: 12, scale: 2 }).notNull().default('0'),
  lowStockThreshold: integer('low_stock_threshold').notNull().default(5),
  trackStock: boolean('track_stock').notNull().default(true),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const stockMovements = pgTable('stock_movements', {
  id: uuid('id').defaultRandom().primaryKey(),
  productId: uuid('product_id')
    .references(() => products.id, { onDelete: 'cascade' })
    .notNull(),
  change: integer('change').notNull(),
  type: stockMovementTypeEnum('type').notNull(),
  note: text('note').default(''),
  createdBy: uuid('created_by').references(() => profiles.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const reviews = pgTable(
  'reviews',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    businessId: uuid('business_id')
      .references(() => businesses.id, { onDelete: 'cascade' })
      .notNull(),
    userId: uuid('user_id')
      .references(() => profiles.id, { onDelete: 'cascade' })
      .notNull(),
    rating: integer('rating').notNull(),
    comment: text('comment').default(''),
    ownerReply: text('owner_reply'),
    ownerRepliedAt: timestamp('owner_replied_at'),
    status: reviewStatusEnum('status').notNull().default('visible'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [uniqueIndex('reviews_business_user_idx').on(table.businessId, table.userId)]
);

export const favorites = pgTable(
  'favorites',
  {
    userId: uuid('user_id')
      .references(() => profiles.id, { onDelete: 'cascade' })
      .notNull(),
    businessId: uuid('business_id')
      .references(() => businesses.id, { onDelete: 'cascade' })
      .notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.businessId] })]
);

export const enquiries = pgTable('enquiries', {
  id: uuid('id').defaultRandom().primaryKey(),
  businessId: uuid('business_id')
    .references(() => businesses.id, { onDelete: 'cascade' })
    .notNull(),
  productId: uuid('product_id').references(() => products.id, { onDelete: 'set null' }),
  userId: uuid('user_id').references(() => profiles.id, { onDelete: 'set null' }),
  name: text('name').notNull(),
  phone: text('phone').notNull(),
  message: text('message').notNull(),
  status: enquiryStatusEnum('status').notNull().default('new'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const verificationRequests = pgTable('verification_requests', {
  id: uuid('id').defaultRandom().primaryKey(),
  businessId: uuid('business_id')
    .references(() => businesses.id, { onDelete: 'cascade' })
    .notNull(),
  documentUrls: text('document_urls').array().default([]),
  documentType: text('document_type').default('GST Certificate'),
  storefrontPhotoUrl: text('storefront_photo_url').default(''),
  phoneVerified: boolean('phone_verified').notNull().default(false),
  status: verificationRequestStatusEnum('status').notNull().default('pending'),
  rejectReason: text('reject_reason'),
  reviewedBy: uuid('reviewed_by').references(() => profiles.id, { onDelete: 'set null' }),
  reviewedAt: timestamp('reviewed_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const reports = pgTable('reports', {
  id: uuid('id').defaultRandom().primaryKey(),
  targetType: reportTargetTypeEnum('target_type').notNull(),
  targetId: uuid('target_id').notNull(),
  reporterId: uuid('reporter_id').references(() => profiles.id, { onDelete: 'set null' }),
  reason: text('reason').notNull(),
  details: text('details').default(''),
  status: reportStatusEnum('status').notNull().default('open'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const analyticsEvents = pgTable('analytics_events', {
  id: uuid('id').defaultRandom().primaryKey(),
  businessId: uuid('business_id')
    .references(() => businesses.id, { onDelete: 'cascade' })
    .notNull(),
  productId: uuid('product_id').references(() => products.id, { onDelete: 'set null' }),
  eventType: text('event_type').notNull(),
  sessionId: text('session_id').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const notifications = pgTable('notifications', {
  id: uuid('id').defaultRandom().primaryKey(),
  recipientId: uuid('recipient_id')
    .references(() => profiles.id, { onDelete: 'cascade' })
    .notNull(),
  businessId: uuid('business_id').references(() => businesses.id, { onDelete: 'cascade' }),
  type: text('type').notNull(),
  title: text('title').notNull(),
  body: text('body').notNull(),
  link: text('link').default(''),
  isRead: boolean('is_read').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const auditLog = pgTable('audit_log', {
  id: uuid('id').defaultRandom().primaryKey(),
  actorId: uuid('actor_id').references(() => profiles.id, { onDelete: 'set null' }),
  action: text('action').notNull(),
  entity: text('entity').notNull(),
  entityId: text('entity_id'),
  meta: jsonb('meta').$type<Record<string, unknown>>().default({}),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const chatConversations = pgTable(
  'chat_conversations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    businessId: uuid('business_id')
      .references(() => businesses.id, { onDelete: 'cascade' })
      .notNull(),
    customerId: uuid('customer_id')
      .references(() => profiles.id, { onDelete: 'cascade' })
      .notNull(),
    lastMessageText: text('last_message_text').default(''),
    lastMessageAt: timestamp('last_message_at').defaultNow().notNull(),
    customerUnread: integer('customer_unread').notNull().default(0),
    ownerUnread: integer('owner_unread').notNull().default(0),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [uniqueIndex('chat_conv_biz_cust_idx').on(table.businessId, table.customerId)]
);

export const chatMessages = pgTable('chat_messages', {
  id: uuid('id').defaultRandom().primaryKey(),
  conversationId: uuid('conversation_id')
    .references(() => chatConversations.id, { onDelete: 'cascade' })
    .notNull(),
  senderId: uuid('sender_id')
    .references(() => profiles.id, { onDelete: 'cascade' })
    .notNull(),
  senderRole: text('sender_role').notNull().default('customer'),
  text: text('text').notNull(),
  attachmentType: text('attachment_type'),
  attachmentData: jsonb('attachment_data').$type<Record<string, unknown>>(),
  isRead: boolean('is_read').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const platformPaymentSettings = pgTable('platform_payment_settings', {
  id: text('id').primaryKey().default('default'),
  planName: text('plan_name').notNull().default('SoleWeb Pro'),
  monthlyPriceUsd: numeric('monthly_price_usd', { precision: 10, scale: 2 })
    .notNull()
    .default('3.00'),
  upiId: text('upi_id').notNull().default(''),
  upiPayeeName: text('upi_payee_name').notNull().default('SoleWeb'),
  merchantNote: text('merchant_note')
    .notNull()
    .default('SoleWeb Pro Monthly Subscription'),
  webhookSecret: text('webhook_secret').notNull().default(''),
  updatedBy: uuid('updated_by').references(() => profiles.id, { onDelete: 'set null' }),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const subscriptionPaymentSessions = pgTable(
  'subscription_payment_sessions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    profileId: uuid('profile_id')
      .references(() => profiles.id, { onDelete: 'cascade' })
      .notNull(),
    businessId: uuid('business_id').references(() => businesses.id, { onDelete: 'set null' }),
    transactionRef: text('transaction_ref').notNull().unique(),
    countryCode: text('country_code').notNull().default('IN'),
    currencyCode: text('currency_code').notNull().default('INR'),
    amountUsd: numeric('amount_usd', { precision: 10, scale: 2 }).notNull().default('3.00'),
    exchangeRate: numeric('exchange_rate', { precision: 14, scale: 6 })
      .notNull()
      .default('84.500000'),
    convertedAmount: numeric('converted_amount', { precision: 14, scale: 2 }).notNull(),
    inrSettlementAmount: numeric('inr_settlement_amount', { precision: 12, scale: 2 }).notNull(),
    payeeUpiId: text('payee_upi_id').notNull(),
    payeeName: text('payee_name').notNull().default('SoleWeb'),
    upiUri: text('upi_uri').notNull(),
    status: text('status').notNull().default('pending'),
    utrReference: text('utr_reference').default(''),
    payerUpiId: text('payer_upi_id').default(''),
    verifiedSource: text('verified_source').default(''),
    paymentId: uuid('payment_id'),
    expiresAt: timestamp('expires_at').notNull(),
    paidAt: timestamp('paid_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('sub_sessions_profile_idx').on(table.profileId),
    index('sub_sessions_status_idx').on(table.status),
    index('sub_sessions_expires_idx').on(table.expiresAt),
  ]
);

export const subscriptionPayments = pgTable(
  'subscription_payments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    profileId: uuid('profile_id')
      .references(() => profiles.id, { onDelete: 'cascade' })
      .notNull(),
    businessId: uuid('business_id').references(() => businesses.id, { onDelete: 'set null' }),
    planCode: text('plan_code').notNull().default('pro_monthly'),
    countryCode: text('country_code').notNull().default('IN'),
    currencyCode: text('currency_code').notNull().default('INR'),
    amountUsd: numeric('amount_usd', { precision: 10, scale: 2 }).notNull().default('3.00'),
    exchangeRate: numeric('exchange_rate', { precision: 14, scale: 6 })
      .notNull()
      .default('84.500000'),
    convertedAmount: numeric('converted_amount', { precision: 14, scale: 2 }).notNull(),
    inrSettlementAmount: numeric('inr_settlement_amount', { precision: 12, scale: 2 }).notNull(),
    payeeUpiId: text('payee_upi_id').notNull(),
    utrReference: text('utr_reference').notNull(),
    payerUpiId: text('payer_upi_id').default(''),
    status: text('status').notNull().default('pending'),
    adminNote: text('admin_note').default(''),
    periodStart: timestamp('period_start'),
    periodEnd: timestamp('period_end'),
    reviewedBy: uuid('reviewed_by').references(() => profiles.id, { onDelete: 'set null' }),
    reviewedAt: timestamp('reviewed_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('sub_payments_profile_idx').on(table.profileId),
    index('sub_payments_status_idx').on(table.status),
  ]
);

// Relations
export const profilesRelations = relations(profiles, ({ many }) => ({
  businesses: many(businesses),
  reviews: many(reviews),
  favorites: many(favorites),
  notifications: many(notifications),
  chatConversations: many(chatConversations),
}));

export const categoriesRelations = relations(categories, ({ many }) => ({
  businesses: many(businesses),
}));

export const businessesRelations = relations(businesses, ({ one, many }) => ({
  owner: one(profiles, {
    fields: [businesses.ownerId],
    references: [profiles.id],
  }),
  category: one(categories, {
    fields: [businesses.categoryId],
    references: [categories.id],
  }),
  posts: many(posts),
  products: many(products),
  reviews: many(reviews),
  enquiries: many(enquiries),
  verificationRequests: many(verificationRequests),
}));

export const productsRelations = relations(products, ({ one, many }) => ({
  business: one(businesses, {
    fields: [products.businessId],
    references: [businesses.id],
  }),
  inventory: one(inventory, {
    fields: [products.id],
    references: [inventory.productId],
  }),
  stockMovements: many(stockMovements),
}));
