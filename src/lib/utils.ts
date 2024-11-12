export function formatDate(date: Date | string): string {
  // If date is a string, convert it to Date object
  const dateObject = typeof date === 'string' ? new Date(date) : date;
  
  // Check if date is valid
  if (isNaN(dateObject.getTime())) {
    console.error('Invalid date:', date);
    return 'Invalid date';
  }

  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(dateObject);
}

export function generateChapterSlug(chapterNumber: number, chapterTitle?: string): string {
  const baseSlug = `c${chapterNumber}`;
  
  if (chapterTitle) {
    const titleSlug = chapterTitle.toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-');
    return `${baseSlug}-${titleSlug}`;
  }
  
  return baseSlug;
}

export function generateNovelSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
} 