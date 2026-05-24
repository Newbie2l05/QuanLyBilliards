const expectedCode = pm.iterationData.get("expected_code");
const testId = pm.iterationData.get("test_id");

pm.test("[" + testId + "] Kiem tra HTTP Status", function () {
    pm.response.to.have.status(expectedCode);
});
