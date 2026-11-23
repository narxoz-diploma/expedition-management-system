import { startTransition, type FormEvent } from "react";

/**
 * Отправка формы без сброса заполненного.
 *
 * `<form action={formAction}>` в React 19 после каждой отправки возвращает
 * неуправляемые поля к `defaultValue` — в том числе когда сервер ответил
 * ошибкой проверки. Лидер ошибся в одном поле формы похода и терял все
 * семнадцать: написал об этом автор 13 сентября 2026. Через `onSubmit` React
 * формой не распоряжается, а `pending` и состояние `useActionState` работают
 * как прежде.
 *
 * Цена — отправка без JavaScript: форма не уйдёт, пока страница не ожила.
 * Остальные формы проекта (`join-form`, `members-admin`, вход) так живут с
 * самого начала.
 */
export function submitKeepingValues(dispatch: (data: FormData) => void) {
  return (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    // submitter — чтобы значение нажатой кнопки с `name` не потерялось, как
    // при обычной отправке.
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const data = new FormData(event.currentTarget, submitter);
    startTransition(() => dispatch(data));
  };
}
