import { Chapter, UserProfile } from '@/types/database';
import { Icon } from '@iconify/react';
import Link from 'next/link';
import { formatDate } from '@/lib/utils';
import { toast } from 'react-hot-toast';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import supabase from '@/lib/supabaseClient';

interface ChapterListItemProps {
  chapter: Chapter;
  novelSlug: string;
  userProfile: UserProfile | null;
  isAuthenticated: boolean;
  coinCost?: number;
}

export function ChapterListItem({ 
  chapter, 
  novelSlug, 
  userProfile, 
  isAuthenticated,
  coinCost = 5
}: ChapterListItemProps) {
  const [isUnlocking, setIsUnlocking] = useState(false);
  const router = useRouter();

  const isPublished = !chapter.publish_at || new Date(chapter.publish_at) <= new Date();
  const isUnlocked = chapter.isUnlocked;
  
  const unlockChapter = async () => {
    try {
      if (!userProfile) return;
      if (!chapter.novel_id) {
        throw new Error('Novel ID is missing from chapter data');
      }

      // Start a transaction to update user's coins and create unlock record
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      console.log('Attempting to unlock chapter:', {
        chapter_id: chapter.id,
        novel_id: chapter.novel_id,
        chapter_number: chapter.chapter_number,
        user_id: user.id
      });

      // First, update the user's coin balance
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ 
          coins: userProfile.coins - coinCost,
          updated_at: new Date().toISOString()
        })
        .eq('id', user.id);

      if (updateError) throw updateError;

      // Generate a UUID for the chapter unlock
      const unlockId = crypto.randomUUID();

      console.log('Chapter data:', {
        id: chapter.id,
        novel_id: chapter.novel_id,
        chapter_number: chapter.chapter_number
      });

      console.log('Full chapter object:', chapter);

      // Then, create an unlock record with an explicit ID
      const { error: unlockError } = await supabase
        .from('chapter_unlocks')
        .insert({
          id: unlockId,
          profile_id: user.id,
          novel_id: chapter.novel_id,
          chapter_number: chapter.chapter_number,
          cost: coinCost,
          created_at: new Date().toISOString()
        });

      if (unlockError) {
        // Rollback the coin deduction if unlock creation fails
        await supabase
          .from('profiles')
          .update({ 
            coins: userProfile.coins,
            updated_at: new Date().toISOString()
          })
          .eq('id', user.id);
          
        throw unlockError;
      }

      // Show success message and redirect to chapter
      toast.success('Chapter unlocked successfully!');
      router.push(`/novels/${novelSlug}/chapters/c${chapter.chapter_number}`);
      router.refresh();

    } catch (error) {
      console.error('Error unlocking chapter:', error);
      toast.error('Failed to unlock chapter. Please try again.');
    } finally {
      setIsUnlocking(false);
    }
  };

  const handleLockedChapterClick = () => {
    if (!isAuthenticated) {
      toast.error('Please create an account to unlock chapters', {
        duration: 3000,
        position: 'bottom-center',
      });
      return;
    }

    if (!userProfile) return;

    if (userProfile.coins < coinCost) {
      toast.error(`Not enough coins. You need ${coinCost} coins to unlock this chapter`, {
        duration: 3000,
        position: 'bottom-center',
        style: {
          background: '#EF4444',
          color: 'white',
          padding: '12px 24px',
        },
        icon: <Icon icon="material-symbols:payments-outline" className="text-xl" />,
      });
      return;
    }

    if (isUnlocking) return;
    setIsUnlocking(true);

    toast((t) => (
      <div className="flex flex-col gap-2">
        <div className="font-medium">
          Unlock Chapter {chapter.chapter_number} for {coinCost} coins?
        </div>
        <div className="flex gap-2">
          <button
            onClick={async () => {
              toast.dismiss(t.id);
              await unlockChapter();
            }}
            className="px-3 py-1 bg-purple-600 text-white rounded-md hover:bg-purple-700"
          >
            Confirm
          </button>
          <button
            onClick={() => {
              toast.dismiss(t.id);
              setIsUnlocking(false);
            }}
            className="px-3 py-1 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300"
          >
            Cancel
          </button>
        </div>
      </div>
    ), {
      duration: 5000,
      position: 'bottom-center',
      style: {
        background: 'white',
        padding: '16px',
      },
    });
  };

  const chapterContent = (
    <>
      <span className="inline-block min-w-[3rem]">Ch. {chapter.chapter_number}</span>
      {chapter.title && <span className="ml-2">{chapter.title}</span>}
    </>
  );

  return (
    <div className={`flex flex-col border-b border-gray-100 py-3 px-4 ${
      isPublished ? 'hover:bg-gray-50' : 'bg-gray-50/50'
    } transition-colors rounded-lg gap-2`}>
      <div className="flex-grow flex flex-col w-full gap-2">
        {!isPublished && !isUnlocked ? (
          <>
            <div 
              className="text-gray-600 cursor-pointer"
              onClick={handleLockedChapterClick}
            >
              {chapterContent}
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 bg-purple-50 text-purple-800 px-2 py-1 rounded-md text-sm">
                <Icon icon="material-symbols:lock" className="text-lg" />
                <span className="font-medium">
                  {formatDate(chapter.publish_at || new Date())} • {coinCost} coins
                  {userProfile && (
                    <span className="ml-2">
                      ({userProfile.coins} coins available)
                    </span>
                  )}
                </span>
              </div>
            </div>
          </>
        ) : (
          <Link 
            href={`/novels/${novelSlug}/chapters/c${chapter.chapter_number}`}
            className="flex-grow flex flex-col sm:flex-row sm:items-center text-gray-600 gap-1 hover:text-gray-900"
          >
            <div className="flex items-center gap-2">
              {chapterContent}
              {isUnlocked && (
                <span className="text-green-600 text-sm">
                  (Unlocked)
                </span>
              )}
            </div>
          </Link>
        )}
      </div>
    </div>
  );
} 