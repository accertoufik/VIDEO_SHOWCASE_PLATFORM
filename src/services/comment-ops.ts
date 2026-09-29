import { prisma } from '../config/db';

/**
 * Soft-deletes a comment AND its live replies, and decrements commentCount by
 * exactly the number of rows hidden. (Replies vanish from listComments once
 * their parent is deleted, so the old "-1" left the counter too high.)
 */



export const softDeleteCommentTree = async (comment: { id: string; videoId: string; parentCommentId: string | null }) => { 
    const now = new Date();
    const liveReplies = comment.parentCommentId ? [] : await prisma.comment.findMany({
        where: { parentCommentId: comment.id, deletedAt: null },
        select: { id: true },
    });
    const allIds = [comment.id, ...liveReplies.map((r) => r.id)];
    const result = await prisma.$transaction([
        prisma.comment.updateMany({
            where: { id: { in: allIds }, deletedAt: null },
            data: { deletedAt: now },
        }),
        prisma.video.update({
            where: { id: comment.videoId },
            data: { commentCount: { decrement: allIds.length } },
        }),
    ]);
    if (result[0].count !== allIds.length) {
        throw new Error(`Expected to delete ${allIds.length} comments, but deleted ${result[0].count}`);
    }
    return { deleted: true, deletedCount: allIds.length };
        
}