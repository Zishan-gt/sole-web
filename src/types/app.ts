export interface CategoryItem {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  icon: string;
  sortOrder: number;
  isActive: boolean;
}

export interface BusinessHoursSlot {
  open: string;
  close: string;
  closed: boolean;
}

export interface BusinessSummary {
  id: string;
  ownerId?: string;
  name: string;
  slug: string;
  categoryId: string | null;
  categoryName?: string;
  categorySlug?: string;
  subcategory: string | null;
  bio: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  website: string | null;
  googleMapsUrl: string | null;
  addressLine: string | null;
  area: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  country: string;
  lat: number;
  lng: number;
  logoUrl: string | null;
  coverUrl: string | null;
  hours: Record<string, BusinessHoursSlot> | null;
  socialLinks: Record<string, string> | null;
  tags: string[] | null;
  status: 'draft' | 'published' | 'suspended';
  verificationStatus: 'not_requested' | 'pending' | 'approved' | 'rejected';
  isVerified: boolean;
  ratingAvg: string;
  ratingCount: number;
  distanceKm?: number | null;
  isOpenNow?: boolean;
  productsCount?: number;
  createdAt?: string;
}

export interface PostItem {
  id: string;
  businessId: string;
  type: 'photo' | 'video';
  mediaUrl: string;
  posterUrl: string | null;
  caption: string | null;
  trimStartSec?: number | null;
  trimEndSec?: number | null;
  durationSec?: number | null;
  isPinned: boolean;
  sortOrder: number;
  createdAt: string;
}

export interface ProductItem {
  id: string;
  businessId: string;
  type: 'product' | 'service';
  name: string;
  description: string | null;
  categoryLabel: string | null;
  price: string;
  discountPrice: string | null;
  unit: string | null;
  durationMinutes: number | null;
  sku: string | null;
  images: string[] | null;
  tags: string[] | null;
  isActive: boolean;
  availability: 'in_stock' | 'low_stock' | 'out_of_stock' | 'not_tracked';
  viewCount: number;
  inventory?: {
    productId: string;
    quantity: number;
    costPrice: string;
    lowStockThreshold: number;
    trackStock: boolean;
  } | null;
}

export interface ReviewItem {
  id: string;
  businessId: string;
  userId: string;
  rating: number;
  comment: string | null;
  ownerReply: string | null;
  ownerRepliedAt: string | null;
  createdAt: string;
  authorName: string;
  authorHandle?: string | null;
  authorAvatar?: string | null;
}

export interface ChatAttachment {
  type: 'product' | 'location';
  data: Record<string, unknown>;
}

export interface ChatMessageItem {
  id: string;
  conversationId: string;
  senderId: string;
  senderRole: 'customer' | 'owner';
  text: string;
  attachmentType?: 'product' | 'location' | null;
  attachmentData?: Record<string, unknown> | null;
  isRead: boolean;
  createdAt: string;
}

export interface ChatConversationItem {
  id: string;
  businessId: string;
  businessName: string;
  businessSlug: string;
  businessLogo: string | null;
  businessVerified: boolean;
  businessOwnerId: string;
  customerId: string;
  customerName: string;
  customerHandle: string | null;
  customerAvatar: string | null;
  lastMessageText: string;
  lastMessageAt: string;
  unreadCount: number;
  viewerRole: 'customer' | 'owner';
}
