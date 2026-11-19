import { glob } from "astro/loaders"
import { defineCollection } from "astro:content"
import { z } from "astro/zod"

const blog = defineCollection({
  loader: glob({
    pattern: "**/[^_]*.md",
    base: "./src/content/blog",
  }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      description: z.string(),
      date: z.coerce.date(),
      order: z.number().optional(),
      tags: z.array(z.string()).optional(),
      image: image().optional(),
      draft: z.boolean().optional(),
    }),
})

const projects = defineCollection({
  loader: glob({
    pattern: "**/[^_]*.md",
    base: "./src/content/projects",
  }),
  schema: ({ image }) =>
    z.object({
      name: z.string(),
      description: z.string(),
      link: z.url(),
      tags: z.array(z.string()).optional(),
      image: image().optional(),
      startDate: z.coerce.date().optional(),
      endDate: z.coerce.date().optional(),
    }),
})

const gallery = defineCollection({
  loader: glob({
    pattern: "**/[^_]*.md",
    base: "./src/content/gallery",
  }),
  schema: ({ image }) =>
    z.object({
      caption: z.string(),
      date: z.coerce.date().optional(),
      tags: z.array(z.string()).optional(),
      location: z.string().optional(),
      alt: z.string().optional(),
      image: image(),
    }),
})

export const collections = {
  blog,
  projects,
  gallery,
}
