export const dynamic = "force-dynamic";

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');
    const q = searchParams.get('q');
    const featured = searchParams.get('featured') === 'true';
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '9');
    const skip = (page - 1) * limit;

    const where: any = {
      status: 'published',
    };

    if (category && category !== 'All') {
      where.category = category;
    }

    if (featured) {
      where.featured = true;
    }

    // Server-side search logic
    if (q) {
      where.OR = [
        { title: { contains: q } },
        { excerpt: { contains: q } },
        { content: { contains: q } },
        { tags: { contains: q } }
      ];
    }

    try {
      const [blogs, total] = await Promise.all([
        prisma.blogPost.findMany({
          where,
          select: {
            id: true,
            title: true,
            slug: true,
            excerpt: true,
            category: true,
            thumbnail: true,
            tags: true,
            publishedAt: true,
            readTime: true,
            views: true,
            featured: true,
            adminNote: true,
            author: {
              select: {
                name: true,
                image: true,
                avatar_url: true,
                role: true,
              },
            },
          },

          orderBy: {
            publishedAt: 'desc',
          },
          skip,
          take: limit,
        }),
        prisma.blogPost.count({ where }),
      ]);

      const formattedBlogs = blogs.map((blog: any) => {
        const isOfficial = blog.adminNote === 'SARTHI_OFFICIAL';
        let authorName = blog.author?.name || 'SARTHI Expert';
        if (authorName.toLowerCase() === 'mukul pandey' || authorName.toLowerCase().includes('mukul pandey')) {
          authorName = 'Dr. Mukul Pandey';
        } else if (isOfficial) {
          authorName = 'Dr. Mukul Pandey';
        }
        return {
          ...blog,
          author: {
            name: authorName,
            avatar: isOfficial ? '/sarthi-logo.png' : (blog.author?.avatar_url || blog.author?.image || '/sarthi-logo.png'),
          },
          tags: blog.tags ? blog.tags.split(',').map((t: string) => t.trim()) : [],
        };
      });

      const response = NextResponse.json({
        blogs: formattedBlogs,
        total,
        page,
        totalPages: Math.ceil(total / limit),
      });

      response.headers.set('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=30');
      return response;
    } catch (prismaError) {
      console.error('[BLOGS_PRISMA_ERROR]', prismaError);
      
      if (process.env.DEV_AUTH_FALLBACK === '1') {
        return NextResponse.json({
          blogs: [
            {
              id: 'dev-blog-1',
              title: 'Mastering Next.js 14 Development',
              slug: 'mastering-nextjs-14',
              excerpt: 'Learn the latest features of Next.js 14 and how to build high-performance apps.',
              category: 'Development',
              thumbnail: '/sarthi-logo.png',
              tags: ['Next.js', 'React', 'Tech'],
              publishedAt: new Date().toISOString(),
              readTime: '5 min read',
              author: { name: 'Dev Guide', avatar: '/sarthi-logo.png' }
            }
          ],
          total: 1,
          page: 1,
          totalPages: 1
        });
      }
      throw prismaError;
    }
  } catch (error) {
    console.error('[BLOGS_GET_ERROR]', error);
    return NextResponse.json(
      { error: 'Failed to fetch blogs', message: error instanceof Error ? error.message : 'Unknown error' }, 
      { status: 500 }
    );
  }
}


