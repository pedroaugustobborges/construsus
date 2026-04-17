import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { Conversation, Message } from '@/types';

export function useConversations(userId: string | undefined) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchConversations = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('conversations')
      .select('*, messages(count)')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(50);

    if (!error && data) {
      setConversations(data as Conversation[]);
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  const createConversation = async (title: string): Promise<Conversation | null> => {
    if (!userId) return null;
    const { data, error } = await supabase
      .from('conversations')
      .insert({ user_id: userId, title })
      .select()
      .single();

    if (error) {
      console.error('Error creating conversation:', error);
      return null;
    }
    const newConv = data as Conversation;
    setConversations(prev => [newConv, ...prev]);
    return newConv;
  };

  const deleteConversation = async (id: string) => {
    await supabase.from('conversations').delete().eq('id', id);
    setConversations(prev => prev.filter(c => c.id !== id));
  };

  const updateConversationTitle = async (id: string, title: string) => {
    await supabase.from('conversations').update({ title }).eq('id', id);
    setConversations(prev =>
      prev.map(c => c.id === id ? { ...c, title } : c)
    );
  };

  return {
    conversations,
    loading,
    createConversation,
    deleteConversation,
    updateConversationTitle,
    refresh: fetchConversations,
  };
}

export function useMessages(conversationId: string | null) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!conversationId) {
      setMessages([]);
      return;
    }

    const fetchMessages = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true });

      if (!error && data) {
        setMessages(data as Message[]);
      }
      setLoading(false);
    };

    fetchMessages();
  }, [conversationId]);

  const addMessage = (message: Message) => {
    setMessages(prev => [...prev, message]);
  };

  const updateLastMessage = (content: string) => {
    setMessages(prev => {
      const updated = [...prev];
      if (updated.length > 0) {
        updated[updated.length - 1] = {
          ...updated[updated.length - 1],
          content,
        };
      }
      return updated;
    });
  };

  return { messages, loading, addMessage, updateLastMessage, setMessages };
}
