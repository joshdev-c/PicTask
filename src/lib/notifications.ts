import * as Notifications from 'expo-notifications';
import type { TaskRecord } from '../types';

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldPlaySound: false, shouldSetBadge: false, shouldShowBanner: true, shouldShowList: true }),
});

export async function scheduleTaskReminders(task: TaskRecord) {
  if (!task.dueDate || task.completed) return;
  const permissions = await Notifications.getPermissionsAsync();
  const granted = permissions.granted || (await Notifications.requestPermissionsAsync()).granted;
  if (!granted) return;
  const due = new Date(`${task.dueDate}T09:00:00+08:00`);
  const now = Date.now();
  for (const days of task.reminderDays) {
    const trigger = new Date(due.getTime() - days * 24 * 60 * 60 * 1000);
    if (trigger.getTime() > now) {
      await Notifications.scheduleNotificationAsync({
        content: { title: 'PicTask reminder', body: `${task.title} is due in ${days} day${days === 1 ? '' : 's'}.`, data: { taskId: task.id } },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: trigger },
      });
    }
  }
}
