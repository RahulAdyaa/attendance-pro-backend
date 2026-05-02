const axios = require('axios');

const API_URL = 'http://localhost:5001/api';

async function runTests() {
  console.log('--- STARTING E2E BACKEND TEST ---');
  let teacherToken = '';
  let studentToken = '';
  let classId = '';

  try {
    console.log('1. Testing Teacher Registration...');
    const teacherEmail = `teacher_${Date.now()}@test.com`;
    const regRes = await axios.post(`${API_URL}/auth/register`, {
      email: teacherEmail,
      password: 'password123',
      name: 'Test Teacher',
      role: 'TEACHER',
      schoolName: 'Test School'
    });
    console.log('✅ Teacher Registration successful');

    console.log('2. Testing Teacher Login...');
    const loginRes = await axios.post(`${API_URL}/auth/login`, {
      email: teacherEmail,
      password: 'password123'
    });
    teacherToken = loginRes.data.token;
    console.log('✅ Teacher Login successful');

    console.log('3. Testing Class Creation...');
    const classRes = await axios.post(`${API_URL}/classes`, {
      name: 'Test Class 101',
      subject: 'Testing',
      classCode: `TEST${Date.now().toString().slice(-4)}`
    }, { headers: { Authorization: `Bearer ${teacherToken}` } });
    classId = classRes.data.id;
    console.log('✅ Class Creation successful');

    console.log('4. Testing Student Registration (Joining Class)...');
    const studentEmail = `student_${Date.now()}@test.com`;
    const studRegRes = await axios.post(`${API_URL}/auth/register`, {
      email: studentEmail,
      password: 'password123',
      name: 'Test Student',
      role: 'STUDENT',
      rollNumber: '101',
      classCode: classRes.data.classCode
    });
    studentToken = studRegRes.data.token;
    console.log('✅ Student Registration & Join successful');

    console.log('5. Testing Mark Attendance...');
    const markRes = await axios.post(`${API_URL}/attendance`, {
      classId: classId,
      date: new Date().toISOString(),
      records: [
        { studentId: studRegRes.data.user.student.id, status: 'PRESENT' }
      ]
    }, { headers: { Authorization: `Bearer ${teacherToken}` } });
    console.log('✅ Mark Attendance successful');

    console.log('6. Testing Teacher Stats...');
    const statsRes = await axios.get(`${API_URL}/classes/teacher/stats?date=${new Date().toISOString().split('T')[0]}`, {
      headers: { Authorization: `Bearer ${teacherToken}` }
    });
    console.log('✅ Fetch Stats successful. Stats:', statsRes.data);

    console.log('--- ALL TESTS PASSED ---');
  } catch (error) {
    console.error('❌ TEST FAILED:', error.response?.data || error.message);
  }
}

runTests();
