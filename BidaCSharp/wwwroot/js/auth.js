document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('loginForm');
    const errorDiv = document.getElementById('loginError');

    form.addEventListener('submit', async event => {
        event.preventDefault();
        errorDiv.classList.add('d-none');

        const username = document.getElementById('username').value.trim();
        const password = document.getElementById('password').value;

        try {
            const data = await apiCall('/api/login', {
                method: 'POST',
                body: JSON.stringify({ username, password })
            });

            if (!data) {
                return;
            }

            localStorage.setItem('token', data.token);
            localStorage.setItem('user', JSON.stringify(data.user));
            window.location.href = '/dashboard.html';
        } catch (err) {
            errorDiv.textContent = err.message || 'Đăng nhập thất bại';
            errorDiv.classList.remove('d-none');
        }
    });
});
