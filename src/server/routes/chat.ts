import { Router } from 'express';
import { and, desc, eq, inArray, ne, or } from 'drizzle-orm';
import { db } from '../../db/index.ts';
import { businesses, chatConversations, chatMessages, products, profiles } from '../../db/schema.ts';
import { requireAuth, type AuthRequest } from '../../middleware/auth.ts';
import { chatMessageSchema } from '../../lib/validators.ts';
import { createAndPushNotification, sendToProfile } from '../../lib/realtime.ts';

export const chatRouter = Router();
chatRouter.use(requireAuth);

async function loadConversationWithAccess(conversationId: string, profileId: string) {
  const [conv] = await db
    .select()
    .from(chatConversations)
    .where(eq(chatConversations.id, conversationId))
    .limit(1);
  if (!conv) return null;

  const [biz] = await db
    .select({
      id: businesses.id,
      ownerId: businesses.ownerId,
      name: businesses.name,
      slug: businesses.slug,
      logoUrl: businesses.logoUrl,
      coverUrl: businesses.coverUrl,
      isVerified: businesses.isVerified,
      area: businesses.area,
      city: businesses.city,
      lat: businesses.lat,
      lng: businesses.lng,
      googleMapsUrl: businesses.googleMapsUrl,
    })
    .from(businesses)
    .where(eq(businesses.id, conv.businessId))
    .limit(1);
  if (!biz) return null;

  const isCustomer = conv.customerId === profileId;
  const isOwner = biz.ownerId === profileId;
  if (!isCustomer && !isOwner) return null;

  const [cust] = await db
    .select({
      id: profiles.id,
      fullName: profiles.fullName,
      handle: profiles.handle,
      avatarUrl: profiles.avatarUrl,
    })
    .from(profiles)
    .where(eq(profiles.id, conv.customerId))
    .limit(1);

  return {
    conv,
    biz,
    cust,
    viewerRole: isOwner ? ('owner' as const) : ('customer' as const),
    recipientProfileId: isOwner ? conv.customerId : biz.ownerId,
  };
}

// List all conversations where user is customer OR business owner
chatRouter.get('/conversations', async (req: AuthRequest, res) => {
  try {
    const profileId = req.profile!.id;
    const ownedBusinesses = await db
      .select({ id: businesses.id })
      .from(businesses)
      .where(eq(businesses.ownerId, profileId));
    const ownedBizIds = ownedBusinesses.map((b) => b.id);

    const convRows =
      ownedBizIds.length > 0
        ? await db
            .select()
            .from(chatConversations)
            .where(
              or(
                eq(chatConversations.customerId, profileId),
                inArray(chatConversations.businessId, ownedBizIds)
              )
            )
            .orderBy(desc(chatConversations.lastMessageAt))
        : await db
            .select()
            .from(chatConversations)
            .where(eq(chatConversations.customerId, profileId))
            .orderBy(desc(chatConversations.lastMessageAt));

    if (convRows.length === 0) {
      return res.json({ conversations: [] });
    }

    const bizIds = Array.from(new Set(convRows.map((c) => c.businessId)));
    const custIds = Array.from(new Set(convRows.map((c) => c.customerId)));

    const [bizList, custList] = await Promise.all([
      db
        .select({
          id: businesses.id,
          name: businesses.name,
          slug: businesses.slug,
          logoUrl: businesses.logoUrl,
          coverUrl: businesses.coverUrl,
          isVerified: businesses.isVerified,
          ownerId: businesses.ownerId,
        })
        .from(businesses)
        .where(inArray(businesses.id, bizIds)),
      db
        .select({
          id: profiles.id,
          fullName: profiles.fullName,
          handle: profiles.handle,
          avatarUrl: profiles.avatarUrl,
        })
        .from(profiles)
        .where(inArray(profiles.id, custIds)),
    ]);

    const bizMap = Object.fromEntries(bizList.map((b) => [b.id, b]));
    const custMap = Object.fromEntries(custList.map((c) => [c.id, c]));

    const conversations = convRows
      .map((c) => {
        const b = bizMap[c.businessId];
        const cust = custMap[c.customerId];
        if (!b || !cust) return null;
        const viewerRole = b.ownerId === profileId && c.customerId !== profileId ? 'owner' : 'customer';
        return {
          id: c.id,
          businessId: b.id,
          businessName: b.name,
          businessSlug: b.slug,
          businessLogo: b.logoUrl || b.coverUrl || null,
          businessVerified: b.isVerified,
          businessOwnerId: b.ownerId,
          customerId: cust.id,
          customerName: cust.fullName || 'Customer',
          customerHandle: cust.handle || null,
          customerAvatar: cust.avatarUrl || null,
          lastMessageText: c.lastMessageText || '',
          lastMessageAt: c.lastMessageAt,
          unreadCount: viewerRole === 'owner' ? c.ownerUnread : c.customerUnread,
          viewerRole,
        };
      })
      .filter(Boolean);

    res.json({ conversations });
  } catch (err) {
    console.error('GET /api/chat/conversations failed:', err);
    res.status(500).json({ error: 'Failed to load messages' });
  }
});

// Start or fetch an existing conversation with a storefront
chatRouter.post('/conversations', async (req: AuthRequest, res) => {
  try {
    const businessId = String(req.body?.businessId || '').trim();
    if (!businessId) {
      return res.status(400).json({ error: 'businessId is required' });
    }

    const [biz] = await db
      .select()
      .from(businesses)
      .where(eq(businesses.id, businessId))
      .limit(1);
    if (!biz) {
      return res.status(404).json({ error: 'Business not found' });
    }

    const customerId = req.profile!.id;
    let [conv] = await db
      .select()
      .from(chatConversations)
      .where(
        and(
          eq(chatConversations.businessId, biz.id),
          eq(chatConversations.customerId, customerId)
        )
      )
      .limit(1);

    if (!conv) {
      const [inserted] = await db
        .insert(chatConversations)
        .values({
          businessId: biz.id,
          customerId,
          lastMessageText: '',
        })
        .returning();
      conv = inserted;
    }

    res.status(201).json({
      conversation: {
        id: conv.id,
        businessId: biz.id,
        businessName: biz.name,
        businessSlug: biz.slug,
        businessLogo: biz.logoUrl || biz.coverUrl || null,
        businessVerified: biz.isVerified,
        businessOwnerId: biz.ownerId,
        customerId,
        customerName: req.profile!.fullName || 'Customer',
        customerHandle: req.profile!.handle || null,
        customerAvatar: req.profile!.avatarUrl || null,
        lastMessageText: conv.lastMessageText || '',
        lastMessageAt: conv.lastMessageAt,
        unreadCount: conv.customerUnread,
        viewerRole: biz.ownerId === customerId ? 'owner' : 'customer',
      },
    });
  } catch (err) {
    console.error('POST /api/chat/conversations failed:', err);
    res.status(500).json({ error: 'Failed to start chat conversation' });
  }
});

// Fetch messages in a conversation (and mark incoming read)
chatRouter.get('/conversations/:id/messages', async (req: AuthRequest, res) => {
  try {
    const ctx = await loadConversationWithAccess(req.params.id, req.profile!.id);
    if (!ctx) return res.status(404).json({ error: 'Conversation not found' });

    const msgs = await db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.conversationId, ctx.conv.id))
      .orderBy(chatMessages.createdAt)
      .limit(200);

    // Mark opposite party messages read
    await db
      .update(chatMessages)
      .set({ isRead: true })
      .where(
        and(
          eq(chatMessages.conversationId, ctx.conv.id),
          ne(chatMessages.senderId, req.profile!.id),
          eq(chatMessages.isRead, false)
        )
      );

    await db
      .update(chatConversations)
      .set(
        ctx.viewerRole === 'owner'
          ? { ownerUnread: 0, updatedAt: new Date() }
          : { customerUnread: 0, updatedAt: new Date() }
      )
      .where(eq(chatConversations.id, ctx.conv.id));

    sendToProfile(ctx.recipientProfileId, {
      event: 'chat:read',
      conversationId: ctx.conv.id,
      readerId: req.profile!.id,
    });

    const bizProducts = await db
      .select({
        id: products.id,
        name: products.name,
        price: products.price,
        discountPrice: products.discountPrice,
        images: products.images,
        type: products.type,
      })
      .from(products)
      .where(and(eq(products.businessId, ctx.biz.id), eq(products.isActive, true)))
      .limit(20);

    res.json({
      conversation: {
        id: ctx.conv.id,
        businessId: ctx.biz.id,
        businessName: ctx.biz.name,
        businessSlug: ctx.biz.slug,
        businessLogo: ctx.biz.logoUrl || ctx.biz.coverUrl || null,
        businessVerified: ctx.biz.isVerified,
        businessOwnerId: ctx.biz.ownerId,
        customerId: ctx.conv.customerId,
        customerName: ctx.cust?.fullName || 'Customer',
        customerHandle: ctx.cust?.handle || null,
        customerAvatar: ctx.cust?.avatarUrl || null,
        lastMessageText: ctx.conv.lastMessageText || '',
        lastMessageAt: ctx.conv.lastMessageAt,
        unreadCount: 0,
        viewerRole: ctx.viewerRole,
      },
      business: ctx.biz,
      products: bizProducts,
      messages: msgs,
    });
  } catch (err) {
    console.error('GET /api/chat/conversations/:id/messages failed:', err);
    res.status(500).json({ error: 'Failed to load messages' });
  }
});

// Send a message + emit real-time WebSocket event
chatRouter.post('/conversations/:id/messages', async (req: AuthRequest, res) => {
  try {
    const ctx = await loadConversationWithAccess(req.params.id, req.profile!.id);
    if (!ctx) return res.status(404).json({ error: 'Conversation not found' });

    const parsed = chatMessageSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid message' });
    }
    const { text, attachmentType, attachmentData } = parsed.data;
    const cleanText = text.trim();

    const [createdMsg] = await db
      .insert(chatMessages)
      .values({
        conversationId: ctx.conv.id,
        senderId: req.profile!.id,
        senderRole: ctx.viewerRole,
        text: cleanText,
        attachmentType: attachmentType ?? null,
        attachmentData: attachmentData ?? null,
        isRead: false,
      })
      .returning();

    await db
      .update(chatConversations)
      .set({
        lastMessageText: cleanText.slice(0, 200),
        lastMessageAt: new Date(),
        updatedAt: new Date(),
        ...(ctx.viewerRole === 'owner'
          ? { customerUnread: ctx.conv.customerUnread + 1 }
          : { ownerUnread: ctx.conv.ownerUnread + 1 }),
      })
      .where(eq(chatConversations.id, ctx.conv.id));

    const wsPayload = {
      event: 'chat:message',
      conversationId: ctx.conv.id,
      businessId: ctx.biz.id,
      businessName: ctx.biz.name,
      senderName: ctx.viewerRole === 'owner' ? ctx.biz.name : req.profile!.fullName,
      message: createdMsg,
    };

    // Push live to both recipient and sender's other tabs
    sendToProfile(ctx.recipientProfileId, wsPayload);
    sendToProfile(req.profile!.id, wsPayload);

    if (ctx.recipientProfileId !== req.profile!.id) {
      void createAndPushNotification({
        recipientId: ctx.recipientProfileId,
        businessId: ctx.biz.id,
        type: 'chat',
        title:
          ctx.viewerRole === 'owner'
            ? `Message from ${ctx.biz.name}`
            : `New message from ${req.profile!.fullName}`,
        body: cleanText.slice(0, 120),
        link: `/messages?conv=${ctx.conv.id}`,
      });
    }

    res.status(201).json({ message: createdMsg });
  } catch (err) {
    console.error('POST /api/chat/conversations/:id/messages failed:', err);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// Typing indicator over WebSocket
chatRouter.post('/conversations/:id/typing', async (req: AuthRequest, res) => {
  try {
    const ctx = await loadConversationWithAccess(req.params.id, req.profile!.id);
    if (!ctx) return res.status(404).json({ error: 'Conversation not found' });

    const isTyping = Boolean(req.body?.isTyping);
    sendToProfile(ctx.recipientProfileId, {
      event: 'chat:typing',
      conversationId: ctx.conv.id,
      senderId: req.profile!.id,
      isTyping,
    });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Failed to broadcast typing status' });
  }
});

// Mark conversation read explicitly
chatRouter.post('/conversations/:id/read', async (req: AuthRequest, res) => {
  try {
    const ctx = await loadConversationWithAccess(req.params.id, req.profile!.id);
    if (!ctx) return res.status(404).json({ error: 'Conversation not found' });

    await db
      .update(chatMessages)
      .set({ isRead: true })
      .where(
        and(
          eq(chatMessages.conversationId, ctx.conv.id),
          ne(chatMessages.senderId, req.profile!.id),
          eq(chatMessages.isRead, false)
        )
      );

    await db
      .update(chatConversations)
      .set(
        ctx.viewerRole === 'owner'
          ? { ownerUnread: 0, updatedAt: new Date() }
          : { customerUnread: 0, updatedAt: new Date() }
      )
      .where(eq(chatConversations.id, ctx.conv.id));

    sendToProfile(ctx.recipientProfileId, {
      event: 'chat:read',
      conversationId: ctx.conv.id,
      readerId: req.profile!.id,
    });

    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Failed to mark conversation read' });
  }
});
