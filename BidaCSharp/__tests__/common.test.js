const {
    removeVietnameseTones,
    sanitizeTransferText,
    buildEmvField,
    computeEmvCrc16,
    buildTransferContent,
    buildVietQrPayload,
    calcSessionPlayAmount
} = require('../wwwroot/js/common.js');

describe('common.js utility functions', () => {
    test('removeVietnameseTones strips accents', () => {
        expect(removeVietnameseTones('Bàn số Đẹp')).toBe('Ban so Dep');
    });

    test('sanitizeTransferText keeps only safe transfer characters', () => {
        expect(sanitizeTransferText('Bàn #1 / Đặt trước!!!', 50)).toBe('Ban 1 Dat truoc');
    });

    test('buildEmvField creates EMV tag with padded length', () => {
        expect(buildEmvField('54', '150000')).toBe('5406150000');
    });

    test('computeEmvCrc16 returns an uppercase 4-char hex checksum', () => {
        expect(computeEmvCrc16('0002010102116304')).toMatch(/^[0-9A-F]{4}$/);
    });

    test('buildTransferContent builds a compact transfer description', () => {
        expect(buildTransferContent({
            clubName: 'Bida Đỉnh Cao',
            tableName: 'Bàn VIP 01',
            sessionId: 42
        })).toBe('Bida Dinh Ca Ban VIP S42');
    });

    test('buildVietQrPayload returns null when bank info is missing', () => {
        expect(buildVietQrPayload({
            bankBin: '',
            bankAccount: '123456789',
            amount: 150000
        })).toBeNull();
    });

    test('buildVietQrPayload builds a valid-looking payload', () => {
        const payload = buildVietQrPayload({
            bankBin: '970436',
            bankAccount: '123456789',
            amount: 150000,
            description: 'Thanh toán bàn 01',
            merchantName: 'Bida Đỉnh Cao'
        });

        expect(payload).toContain('000201');
        expect(payload).toContain('5303704');
        expect(payload).toContain('5406150000');
        expect(payload).toContain('5802VN');
        expect(payload).toMatch(/6304[0-9A-F]{4}$/);
    });

    test('calcSessionPlayAmount uses hourly rate when no combo is configured', () => {
        expect(calcSessionPlayAmount(90, 60000, 0, 0)).toBe(90000);
    });

    test('calcSessionPlayAmount adds combo price and extra time correctly', () => {
        expect(calcSessionPlayAmount(190, 60000, 2, 100000)).toBe(170000);
    });
});
