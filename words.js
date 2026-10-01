/**
 * KHO TỪ VỰNG MẶC ĐỊNH
 * ---------------------------------------------------------------
 * Mỗi phần tử là một cặp từ gần nghĩa / cùng chủ đề:
 *   - a, b     : hai từ khóa. Khi bắt đầu ván, app sẽ ngẫu nhiên chọn
 *                1 từ cho Dân làng và từ còn lại cho Gián điệp.
 *   - category : chủ đề (chỉ để hiển thị trong màn hình Kho từ).
 *
 * Lưu ý: dùng file .js (thay vì .json) để app chạy được ngay khi
 * mở index.html trực tiếp (giao thức file://) mà không bị chặn CORS.
 * Cặp từ do người dùng tự thêm được lưu riêng trong LocalStorage.
 */
const DEFAULT_WORD_PAIRS = [
  // ===== Đồ ăn & thức uống =====
  { a: 'Trà sữa', b: 'Cà phê', category: 'Đồ uống' },
  { a: 'Bia', b: 'Rượu', category: 'Đồ uống' },
  { a: 'Coca', b: 'Pepsi', category: 'Đồ uống' },
  { a: 'Trà đá', b: 'Nước mía', category: 'Đồ uống' },
  { a: 'Sinh tố', b: 'Nước ép', category: 'Đồ uống' },
  { a: 'Phở', b: 'Bún bò', category: 'Món ăn' },
  { a: 'Bánh mì', b: 'Bánh bao', category: 'Món ăn' },
  { a: 'Bánh chưng', b: 'Bánh tét', category: 'Món ăn' },
  { a: 'Nem rán', b: 'Gỏi cuốn', category: 'Món ăn' },
  { a: 'Cơm tấm', b: 'Cơm rang', category: 'Món ăn' },
  { a: 'Bánh xèo', b: 'Bánh khọt', category: 'Món ăn' },
  { a: 'Mì tôm', b: 'Miến', category: 'Món ăn' },
  { a: 'Lẩu', b: 'Đồ nướng', category: 'Món ăn' },
  { a: 'Pizza', b: 'Hamburger', category: 'Món ăn' },
  { a: 'Sushi', b: 'Kimbap', category: 'Món ăn' },
  { a: 'Kem', b: 'Sữa chua', category: 'Món ăn' },
  { a: 'Kẹo', b: 'Bánh quy', category: 'Món ăn' },
  { a: 'Phô mai', b: 'Bơ', category: 'Món ăn' },

  // ===== Trái cây =====
  { a: 'Chanh', b: 'Quất', category: 'Trái cây' },
  { a: 'Cam', b: 'Quýt', category: 'Trái cây' },
  { a: 'Vải', b: 'Nhãn', category: 'Trái cây' },
  { a: 'Sầu riêng', b: 'Mít', category: 'Trái cây' },
  { a: 'Dưa hấu', b: 'Dưa lê', category: 'Trái cây' },
  { a: 'Xoài', b: 'Đu đủ', category: 'Trái cây' },
  { a: 'Táo', b: 'Lê', category: 'Trái cây' },

  // ===== Phương tiện =====
  { a: 'Xe máy', b: 'Xe đạp', category: 'Phương tiện' },
  { a: 'Máy bay', b: 'Trực thăng', category: 'Phương tiện' },
  { a: 'Tàu hỏa', b: 'Tàu điện ngầm', category: 'Phương tiện' },
  { a: 'Taxi', b: 'Xe ôm', category: 'Phương tiện' },
  { a: 'Thuyền', b: 'Ca nô', category: 'Phương tiện' },
  { a: 'Ô tô', b: 'Xe buýt', category: 'Phương tiện' },

  // ===== Đồ vật =====
  { a: 'Bút chì', b: 'Bút bi', category: 'Đồ vật' },
  { a: 'Gối', b: 'Chăn', category: 'Đồ vật' },
  { a: 'Kéo', b: 'Dao', category: 'Đồ vật' },
  { a: 'Ô', b: 'Áo mưa', category: 'Đồ vật' },
  { a: 'Điện thoại', b: 'Máy tính bảng', category: 'Đồ vật' },
  { a: 'Tivi', b: 'Máy chiếu', category: 'Đồ vật' },
  { a: 'Quạt điện', b: 'Điều hòa', category: 'Đồ vật' },
  { a: 'Gương', b: 'Cửa sổ', category: 'Đồ vật' },
  { a: 'Kính râm', b: 'Kính cận', category: 'Đồ vật' },
  { a: 'Son môi', b: 'Phấn má', category: 'Đồ vật' },
  { a: 'Dép', b: 'Giày', category: 'Đồ vật' },
  { a: 'Nhẫn', b: 'Bông tai', category: 'Đồ vật' },
  { a: 'Áo dài', b: 'Áo bà ba', category: 'Đồ vật' },

  // ===== Động vật =====
  { a: 'Chó', b: 'Mèo', category: 'Động vật' },
  { a: 'Hổ', b: 'Sư tử', category: 'Động vật' },
  { a: 'Gà', b: 'Vịt', category: 'Động vật' },
  { a: 'Cá heo', b: 'Cá mập', category: 'Động vật' },
  { a: 'Bướm', b: 'Ong', category: 'Động vật' },
  { a: 'Muỗi', b: 'Ruồi', category: 'Động vật' },
  { a: 'Rắn', b: 'Lươn', category: 'Động vật' },

  // ===== Địa điểm =====
  { a: 'Rạp phim', b: 'Nhà hát', category: 'Địa điểm' },
  { a: 'Bãi biển', b: 'Hồ bơi', category: 'Địa điểm' },
  { a: 'Chợ', b: 'Siêu thị', category: 'Địa điểm' },
  { a: 'Thư viện', b: 'Nhà sách', category: 'Địa điểm' },
  { a: 'Sân bay', b: 'Nhà ga', category: 'Địa điểm' },
  { a: 'Công viên', b: 'Sở thú', category: 'Địa điểm' },
  { a: 'Đà Lạt', b: 'Sa Pa', category: 'Địa điểm' },
  { a: 'Hội An', b: 'Huế', category: 'Địa điểm' },

  // ===== Nghề nghiệp =====
  { a: 'Bác sĩ', b: 'Y tá', category: 'Nghề nghiệp' },
  { a: 'Giáo viên', b: 'Gia sư', category: 'Nghề nghiệp' },
  { a: 'Cảnh sát', b: 'Bảo vệ', category: 'Nghề nghiệp' },
  { a: 'Đầu bếp', b: 'Phục vụ', category: 'Nghề nghiệp' },
  { a: 'Ca sĩ', b: 'Diễn viên', category: 'Nghề nghiệp' },
  { a: 'Phi công', b: 'Tiếp viên', category: 'Nghề nghiệp' },

  // ===== Giải trí & đời sống =====
  { a: 'Bóng đá', b: 'Bóng rổ', category: 'Giải trí' },
  { a: 'Cầu lông', b: 'Tennis', category: 'Giải trí' },
  { a: 'Cờ vua', b: 'Cờ tướng', category: 'Giải trí' },
  { a: 'Facebook', b: 'Instagram', category: 'Giải trí' },
  { a: 'TikTok', b: 'YouTube', category: 'Giải trí' },
  { a: 'Karaoke', b: 'Hòa nhạc', category: 'Giải trí' },
  { a: 'Tôn Ngộ Không', b: 'Trư Bát Giới', category: 'Giải trí' },
  { a: 'Tết', b: 'Trung thu', category: 'Đời sống' },
  { a: 'Sinh nhật', b: 'Đám cưới', category: 'Đời sống' },
  { a: 'Mưa', b: 'Bão', category: 'Đời sống' },
  { a: 'Mặt trời', b: 'Mặt trăng', category: 'Đời sống' },
  { a: 'Ngủ trưa', b: 'Ngủ nướng', category: 'Đời sống' },
  { a: 'Selfie', b: 'Livestream', category: 'Đời sống' },
];
