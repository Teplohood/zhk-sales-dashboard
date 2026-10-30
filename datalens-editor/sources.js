const {buildSource} = require('libs/dataset/v2');

module.exports = {
    flats: buildSource({
        datasetId: Editor.getId('flats'),
        columns: [
            'Квартира',
            'Корпус',
            'Этаж',
            'Комнат',
            'Площадь, м²',
            'Цена за м², руб.',
            'Стоимость, руб.',
            'Скидка, руб.',
            'Сумма сделки, руб.',
            'Менеджер',
            'Дата сделки',
            'Дней в работе',
            'Вид',
        ],
        // одна строка = одна квартира, без группировки
        disable_group_by: true,
    }),
};
