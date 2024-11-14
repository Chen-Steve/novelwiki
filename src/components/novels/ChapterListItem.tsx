import { Chapter, UserProfile } from '@/types/database';
import { Icon } from '@iconify/react';
import Link from 'next/link';
import { formatDate } from '@/lib/utils';
import { toast } from 'react-hot-toast';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import supabase from '@/lib/supabaseClient';

interface PostgrestError {
  message: string;
  details: string;
  hint?: string;
  code: string;
}

interface ChapterListItemProps {
  chapter: Chapter;
  novelSlug: string;
  userProfile: UserProfile | null;
  isAuthenticated: boolean;
  coinCost?: number;
}

interface NovelWithProfile {
  author_profile_id: string;
  author_profile: {
    coins: number;
  } | Array<{
    coins: number;
  }>;
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

      // Get the translator's profile ID and current coins
      const { data: novel, error: novelError } = await supabase
        .from('novels')
        .select(`
          author_profile_id,
          author_profile:profiles!novels_author_profile_id_fkey (
            coins
          )
        `)
        .eq('id', chapter.novel_id)
        .single() as unknown as { data: NovelWithProfile, error: PostgrestError };

      if (novelError || !novel?.author_profile_id) {
        console.error('Novel error:', novelError);
        throw new Error('Could not find translator information');
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      // Verify translator profile exists and get current coins
      const { data: translatorProfile, error: verifyError } = await supabase
        .from('profiles')
        .select('coins')
        .eq('id', novel.author_profile_id)
        .single();

      if (verifyError || !translatorProfile) {
        console.error('Could not verify translator profile');
        throw new Error('Translator profile not found');
      }

      const translatorCoinShare = 4; // Out of 5 coins

      console.log('Initial translator profile:', translatorProfile);
      console.log('Current translator coins:', translatorProfile.coins);
      console.log('Amount to add:', translatorCoinShare);
      console.log('New total should be:', translatorProfile.coins + translatorCoinShare);

      // Start the transaction
      // 1. Deduct coins from user
      const { error: deductError } = await supabase
        .from('profiles')
        .update({ 
          coins: userProfile.coins - coinCost,
          updated_at: new Date().toISOString()
        })
        .eq('id', user.id);

      if (deductError) {
        console.error('Error deducting coins:', deductError);
        throw new Error('Failed to deduct coins');
      }

      // Add coins to translator
      const { data: updateResult, error: addError } = await supabase
        .from('profiles')
        .update({ 
          coins: translatorProfile.coins + translatorCoinShare,
          updated_at: new Date().toISOString()
        })
        .eq('id', novel.author_profile_id)
        .eq('role', 'AUTHOR')
        .select('coins');

      console.log('Update result:', updateResult);
      
      if (addError) {
        // Rollback the deduction if adding fails
        await supabase
          .from('profiles')
          .update({ 
            coins: userProfile.coins,
            updated_at: new Date().toISOString()
          })
          .eq('id', user.id);
        
        console.error('Error adding coins to translator:', addError);
        throw new Error('Failed to transfer coins');
      }

      if (!updateResult || updateResult.length === 0) {
        console.error('Update failed - no rows updated');
        throw new Error('Failed to update translator coins');
      }

      // Verify the update worked
      const { data: verifyUpdate, error: verifyUpdateError } = await supabase
        .from('profiles')
        .select('coins')
        .eq('id', novel.author_profile_id)
        .single();
      
      if (verifyUpdateError) {
        console.error('Verify error:', verifyUpdateError);
      }

      console.log('Verified translator coins after update:', verifyUpdate?.coins);

      // 3. Create unlock record
      const unlockId = crypto.randomUUID();
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
        // Rollback both transactions if unlock fails
        await supabase
          .from('profiles')
          .update({ 
            coins: userProfile.coins,
            updated_at: new Date().toISOString()
          })
          .eq('id', user.id);

        await supabase
          .from('profiles')
          .update({ 
            coins: translatorProfile.coins,
            updated_at: new Date().toISOString()
          })
          .eq('id', novel.author_profile_id);
          
        throw unlockError;
      }

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