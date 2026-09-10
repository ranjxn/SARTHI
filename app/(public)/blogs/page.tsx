import { Metadata } from 'next';
import { Suspense } from 'react';
import BlogsClient from './BlogsClient';
import { prisma } from '@/lib/prisma';
import { withResiliency } from '@/lib/resilient-db';

export const metadata: Metadata = {
  title: 'Tech & Engineering Blog | SARTHI',
  description: 'Master Python AI, Software Engineering, and more. Honest comparisons between traditional platforms like Physics Wallah/Allen and the future of tech learning at SARTHI.',
  keywords: [
    'Physics Wallah alternative tech', 
    'Allen career blog', 
    'best coding blog India', 
    'Python AI trends 2026',
    'SARTHI engineering blog'
  ],
};

export const dynamic = 'force-dynamic';


async function getBlogsData(searchParams: { q?: string; category?: string; page?: string }) {
  const q = searchParams.q;
  const category = searchParams.category;
  const page = parseInt(searchParams.page || '1');
  const limit = 200;
  const skip = (page - 1) * limit;

  return withResiliency(
    async () => {
      const where: any = { status: 'published' };
      
      if (category && category !== 'All') {
        where.category = category;
      }
      
      if (q) {
        where.OR = [
          { title: { contains: q } },
          { excerpt: { contains: q } },
          { tags: { contains: q } }
        ];
      }

      const [blogs, total, featuredBlog] = await Promise.all([
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
            author: {
              select: {
                name: true,
                avatar_url: true,
                image: true,
              },
            },
          },
          orderBy: { publishedAt: 'desc' },
          skip,
          take: limit,
        }),
        prisma.blogPost.count({ where }),
        // Only fetch featured if on first page and no filters
        (!q && (!category || category === 'All') && page === 1) 
          ? prisma.blogPost.findFirst({
              where: { status: 'published', featured: true },
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
                author: {
                  select: { name: true, avatar_url: true, image: true }
                }
              },
              orderBy: { publishedAt: 'desc' }
            })
          : Promise.resolve(null)
      ]);

      const formatBlog = (blog: any) => {
        if (!blog) return null;
        let parsedTags: string[] = [];
        if (Array.isArray(blog.tags)) {
          parsedTags = blog.tags;
        } else if (typeof blog.tags === 'string' && blog.tags.trim()) {
          parsedTags = blog.tags.split(',').map((t: string) => t.trim()).filter(Boolean);
        }

        return {
          ...blog,
          author: {
            name: blog.author?.name || 'SARTHI Team',
            avatar: blog.author?.avatar_url || blog.author?.image || '/sarthi-logo.png',
          },
          tags: parsedTags,
          excerpt: blog.excerpt || (blog.content ? blog.content.substring(0, 160).replace(/<[^>]*>/g, '') : ''),
        };
      };

      const formattedBlogs = blogs.map(formatBlog).filter(Boolean);
      const formattedFeatured = featuredBlog ? formatBlog(featuredBlog) : null;

      return { blogs: formattedBlogs, total, featured: formattedFeatured };
    },
    'public-blogs-list'
  );
}

import { getCurrentUser } from '@/lib/auth';

export default async function BlogsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string; page?: string }>;
}) {
  const resolvedSearchParams = await searchParams;
  
  const [res, user] = await Promise.all([
    getBlogsData(resolvedSearchParams),
    getCurrentUser()
  ]);

  const data = res.data;
  
  if (!res.success || !data) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center p-6 text-center">
        <h2 className="text-2xl font-bold text-[#1A3C2E] mb-4">Temporarily Unavailable</h2>
        <p className="text-[#5D705C] max-w-md">We&apos;re updating our blog archive. Please try again in a few minutes.</p>
      </div>
    );
  }

  return (
    <Suspense fallback={<div>Loading...</div>}>
      <BlogsClient 
        initialBlogs={data.blogs} 
        initialTotal={data.total} 
        featured={data.featured}
        user={user} 
      />
    </Suspense>
  );
}


